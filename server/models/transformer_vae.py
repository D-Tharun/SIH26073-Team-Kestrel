"""
SkyGuard AI — Transformer Variational Autoencoder (TransVAE)
Primary anomaly detection model combining Transformer self-attention
with VAE probabilistic latent space for weather time series.
"""
import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
import math
from typing import Tuple, Optional


class PositionalEncoding(nn.Module):
    """Sinusoidal positional encoding for Transformer input."""
    
    def __init__(self, d_model: int, max_len: int = 512, dropout: float = 0.1):
        super().__init__()
        self.dropout = nn.Dropout(p=dropout)
        
        pe = torch.zeros(max_len, d_model)
        position = torch.arange(0, max_len, dtype=torch.float).unsqueeze(1)
        div_term = torch.exp(
            torch.arange(0, d_model, 2).float() * (-math.log(10000.0) / d_model)
        )
        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term)
        pe = pe.unsqueeze(0)  # (1, max_len, d_model)
        self.register_buffer("pe", pe)
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (batch, seq_len, d_model)
        x = x + self.pe[:, :x.size(1), :]
        return self.dropout(x)


class TransformerVAE(nn.Module):
    """
    Transformer-based Variational Autoencoder for time series anomaly detection.
    
    Architecture:
        Input → Linear Projection → Positional Encoding → Transformer Encoder
        → Mean/LogVar heads → Reparameterize → Transformer Decoder → Output Projection
    
    Anomaly Detection:
        Anomalies are detected via high reconstruction error + KL divergence.
        Normal data reconstructs well; anomalous data does not.
    """
    
    def __init__(
        self,
        input_dim: int = 22,
        d_model: int = 64,
        n_heads: int = 4,
        num_encoder_layers: int = 3,
        num_decoder_layers: int = 2,
        d_ff: int = 128,
        latent_dim: int = 32,
        dropout: float = 0.1,
        seq_len: int = 8,
    ):
        super().__init__()
        
        self.input_dim = input_dim
        self.d_model = d_model
        self.latent_dim = latent_dim
        self.seq_len = seq_len
        
        # Input projection
        self.input_proj = nn.Linear(input_dim, d_model)
        self.pos_encoder = PositionalEncoding(d_model, max_len=seq_len, dropout=dropout)
        
        # Transformer Encoder
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model,
            nhead=n_heads,
            dim_feedforward=d_ff,
            dropout=dropout,
            batch_first=True,
            activation="gelu",
        )
        self.transformer_encoder = nn.TransformerEncoder(
            encoder_layer, num_layers=num_encoder_layers
        )
        
        # VAE Latent Space
        self.flatten_dim = d_model * seq_len
        self.fc_mu = nn.Linear(self.flatten_dim, latent_dim)
        self.fc_logvar = nn.Linear(self.flatten_dim, latent_dim)
        
        # Decoder
        self.fc_decode = nn.Linear(latent_dim, self.flatten_dim)
        
        decoder_layer = nn.TransformerDecoderLayer(
            d_model=d_model,
            nhead=n_heads,
            dim_feedforward=d_ff,
            dropout=dropout,
            batch_first=True,
            activation="gelu",
        )
        self.transformer_decoder = nn.TransformerDecoder(
            decoder_layer, num_layers=num_decoder_layers
        )
        
        # Output projection
        self.output_proj = nn.Linear(d_model, input_dim)
        
        self._init_weights()
    
    def _init_weights(self):
        """Xavier uniform initialization for linear layers."""
        for m in self.modules():
            if isinstance(m, nn.Linear):
                nn.init.xavier_uniform_(m.weight)
                if m.bias is not None:
                    nn.init.zeros_(m.bias)
    
    def encode(self, x: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Encode input to latent distribution parameters.
        
        Args:
            x: (batch, seq_len, input_dim)
        Returns:
            mu: (batch, latent_dim)
            logvar: (batch, latent_dim)
        """
        # Project to d_model dimension
        h = self.input_proj(x)  # (batch, seq_len, d_model)
        h = self.pos_encoder(h)
        
        # Transformer encoding
        h = self.transformer_encoder(h)  # (batch, seq_len, d_model)
        
        # Flatten and project to latent space
        h_flat = h.reshape(h.size(0), -1)  # (batch, d_model * seq_len)
        mu = self.fc_mu(h_flat)
        logvar = self.fc_logvar(h_flat)
        
        return mu, logvar
    
    def reparameterize(self, mu: torch.Tensor, logvar: torch.Tensor) -> torch.Tensor:
        """VAE reparameterization trick: z = mu + eps * sigma."""
        std = torch.exp(0.5 * logvar)
        eps = torch.randn_like(std)
        return mu + eps * std
    
    def decode(self, z: torch.Tensor, memory: Optional[torch.Tensor] = None) -> torch.Tensor:
        """
        Decode latent vector to reconstructed time series.
        
        Args:
            z: (batch, latent_dim)
        Returns:
            reconstruction: (batch, seq_len, input_dim)
        """
        # Expand latent to sequence
        h = self.fc_decode(z)  # (batch, d_model * seq_len)
        h = h.reshape(h.size(0), self.seq_len, self.d_model)
        
        # Transformer decoding (self-attending decoder)
        if memory is None:
            memory = h
        h = self.transformer_decoder(h, memory)
        
        # Project back to input dimension
        reconstruction = self.output_proj(h)
        return reconstruction
    
    def forward(self, x: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """
        Full forward pass: encode → reparameterize → decode.
        
        Args:
            x: (batch, seq_len, input_dim)
        Returns:
            reconstruction: (batch, seq_len, input_dim)
            mu: (batch, latent_dim)
            logvar: (batch, latent_dim)
        """
        mu, logvar = self.encode(x)
        z = self.reparameterize(mu, logvar)
        reconstruction = self.decode(z)
        return reconstruction, mu, logvar
    
    @staticmethod
    def loss_function(
        recon_x: torch.Tensor,
        x: torch.Tensor,
        mu: torch.Tensor,
        logvar: torch.Tensor,
        beta: float = 0.5,
    ) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """
        VAE loss = Reconstruction Loss + β × KL Divergence.
        
        Args:
            recon_x: Reconstructed input
            x: Original input
            mu: Latent mean
            logvar: Latent log-variance
            beta: Weight for KL term (lower = more reconstruction-focused)
        
        Returns:
            total_loss, recon_loss, kl_loss
        """
        recon_loss = F.mse_loss(recon_x, x, reduction="mean")
        kl_loss = -0.5 * torch.mean(1 + logvar - mu.pow(2) - logvar.exp())
        total_loss = recon_loss + beta * kl_loss
        return total_loss, recon_loss, kl_loss
    
    def compute_anomaly_score(self, x: torch.Tensor) -> np.ndarray:
        """
        Compute per-sample anomaly scores combining sequence reconstruction MSE,
        maximum feature deviation (to catch single-sensor faults), and KL divergence.
        
        Args:
            x: (batch, seq_len, input_dim)
        Returns:
            scores: np.ndarray of shape (batch,)
        """
        self.eval()
        with torch.no_grad():
            recon, mu, logvar = self.forward(x)
            # Per-sample reconstruction MSE
            recon_error = F.mse_loss(recon, x, reduction="none")
            per_sample_mse = recon_error.mean(dim=(1, 2))  # (batch,)
            
            # Maximum feature deviation to catch single-sensor failures
            max_feat_mse = recon_error.mean(dim=1).max(dim=-1).values  # (batch,)
            
            # Per-sample KL divergence
            kl = -0.5 * (1 + logvar - mu.pow(2) - logvar.exp()).sum(dim=1)
            
            # Combined multi-scale score
            scores = per_sample_mse + 0.5 * max_feat_mse + 0.1 * kl
        
        return scores.cpu().numpy()
    
    def get_reconstruction_error_per_feature(self, x: torch.Tensor) -> np.ndarray:
        """
        Get per-feature reconstruction errors for explainability.
        
        Args:
            x: (batch, seq_len, input_dim)
        Returns:
            errors: np.ndarray of shape (batch, input_dim)
        """
        self.eval()
        with torch.no_grad():
            recon, _, _ = self.forward(x)
            # Average error across time steps, keep feature dimension
            errors = F.mse_loss(recon, x, reduction="none").mean(dim=1)
        return errors.cpu().numpy()
