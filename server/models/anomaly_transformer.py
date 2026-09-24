"""
SkyGuard AI — Anomaly Transformer
Association discrepancy-based anomaly detection.
Based on "Anomaly Transformer: Time Series Anomaly Detection with Association Discrepancy" (ICLR 2022).

Key insight: Normal time points have strong temporal associations with adjacent points.
Anomalous points break these associations, creating a discrepancy between
learned prior-association and raw series-association attention patterns.
"""
import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
import math
from typing import Tuple


class TriangularCausalMask:
    """Causal mask for preventing attention to future timesteps."""
    def __init__(self, B, L, device="cpu"):
        mask = torch.triu(torch.ones(L, L, device=device), diagonal=1).bool()
        self._mask = mask.unsqueeze(0).expand(B, -1, -1)
    
    @property
    def mask(self):
        return self._mask


class AnomalyAttention(nn.Module):
    """
    Anomaly Attention layer with prior-association and series-association.
    
    Prior-association: Learned Gaussian kernel that models expected attention patterns.
    Series-association: Raw attention weights from Q-K dot product.
    Association discrepancy: KL(prior || series) detects anomalies.
    """
    
    def __init__(self, d_model: int, n_heads: int, d_keys: int = None, 
                 attention_dropout: float = 0.1):
        super().__init__()
        d_keys = d_keys or (d_model // n_heads)
        self.n_heads = n_heads
        self.d_keys = d_keys
        self.scale = d_keys ** -0.5
        
        self.query_proj = nn.Linear(d_model, d_keys * n_heads)
        self.key_proj = nn.Linear(d_model, d_keys * n_heads)
        self.value_proj = nn.Linear(d_model, d_keys * n_heads)
        self.out_proj = nn.Linear(d_keys * n_heads, d_model)
        
        # Learnable prior-association parameters (Gaussian kernel)
        self.sigma = nn.Parameter(torch.ones(1, n_heads, 1))
        
        self.dropout = nn.Dropout(attention_dropout)
    
    def forward(self, x: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """
        Args:
            x: (batch, seq_len, d_model)
        Returns:
            output: (batch, seq_len, d_model)
            series_association: (batch, n_heads, seq_len, seq_len) - raw attention
            prior_association: (batch, n_heads, seq_len, seq_len) - Gaussian prior
        """
        B, L, _ = x.shape
        H = self.n_heads
        
        # Q, K, V projections
        queries = self.query_proj(x).view(B, L, H, self.d_keys).transpose(1, 2)
        keys = self.key_proj(x).view(B, L, H, self.d_keys).transpose(1, 2)
        values = self.value_proj(x).view(B, L, H, self.d_keys).transpose(1, 2)
        
        # Series-association: standard scaled dot-product attention
        attn_scores = torch.matmul(queries, keys.transpose(-2, -1)) * self.scale
        series_association = torch.softmax(attn_scores, dim=-1)
        
        # Prior-association: Gaussian kernel based on distance
        distances = torch.abs(
            torch.arange(L, device=x.device).float().unsqueeze(0) -
            torch.arange(L, device=x.device).float().unsqueeze(1)
        )  # (L, L)
        
        sigma = torch.clamp(self.sigma, min=1e-4)  # (1, H, 1)
        prior_association = (
            1.0 / (sigma.unsqueeze(-1) * math.sqrt(2 * math.pi)) *
            torch.exp(-0.5 * (distances.unsqueeze(0).unsqueeze(0) / sigma.unsqueeze(-1)) ** 2)
        )  # (1, H, L, L)
        
        # Normalize prior to valid probability distribution
        prior_association = prior_association / (prior_association.sum(dim=-1, keepdim=True) + 1e-8)
        prior_association = prior_association.expand(B, -1, -1, -1)
        
        # Attended output
        attn_output = torch.matmul(self.dropout(series_association), values)
        attn_output = attn_output.transpose(1, 2).contiguous().view(B, L, -1)
        output = self.out_proj(attn_output)
        
        return output, series_association, prior_association


class AnomalyTransformerLayer(nn.Module):
    """Single layer of Anomaly Transformer with feed-forward network."""
    
    def __init__(self, d_model: int, n_heads: int, d_ff: int = 128, dropout: float = 0.1):
        super().__init__()
        self.attention = AnomalyAttention(d_model, n_heads, attention_dropout=dropout)
        self.norm1 = nn.LayerNorm(d_model)
        self.norm2 = nn.LayerNorm(d_model)
        self.ff = nn.Sequential(
            nn.Linear(d_model, d_ff),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(d_ff, d_model),
            nn.Dropout(dropout),
        )
    
    def forward(self, x: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        # Self-attention with residual
        attn_out, series, prior = self.attention(x)
        x = self.norm1(x + attn_out)
        
        # Feed-forward with residual
        ff_out = self.ff(x)
        x = self.norm2(x + ff_out)
        
        return x, series, prior


class AnomalyTransformerModel(nn.Module):
    """
    Full Anomaly Transformer model for time series anomaly detection.
    
    Detects anomalies by measuring the association discrepancy between
    prior-association (learned Gaussian) and series-association (raw attention).
    """
    
    def __init__(
        self,
        input_dim: int = 22,
        d_model: int = 64,
        n_heads: int = 4,
        num_layers: int = 3,
        d_ff: int = 128,
        dropout: float = 0.1,
        seq_len: int = 8,
    ):
        super().__init__()
        
        self.input_dim = input_dim
        self.seq_len = seq_len
        
        # Input embedding
        self.input_proj = nn.Linear(input_dim, d_model)
        
        # Positional encoding
        pe = torch.zeros(seq_len, d_model)
        position = torch.arange(0, seq_len, dtype=torch.float).unsqueeze(1)
        div_term = torch.exp(torch.arange(0, d_model, 2).float() * (-math.log(10000.0) / d_model))
        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term)
        self.register_buffer("pe", pe.unsqueeze(0))
        
        # Anomaly Transformer layers
        self.layers = nn.ModuleList([
            AnomalyTransformerLayer(d_model, n_heads, d_ff, dropout)
            for _ in range(num_layers)
        ])
        
        # Output reconstruction head
        self.output_proj = nn.Linear(d_model, input_dim)
    
    def forward(self, x: torch.Tensor) -> Tuple[torch.Tensor, list, list]:
        """
        Forward pass.
        
        Args:
            x: (batch, seq_len, input_dim)
        Returns:
            output: (batch, seq_len, input_dim) reconstruction
            all_series: list of series-association matrices per layer
            all_prior: list of prior-association matrices per layer
        """
        h = self.input_proj(x) + self.pe[:, :x.size(1), :]
        
        all_series = []
        all_prior = []
        
        for layer in self.layers:
            h, series, prior = layer(h)
            all_series.append(series)
            all_prior.append(prior)
        
        output = self.output_proj(h)
        return output, all_series, all_prior
    
    @staticmethod
    def association_discrepancy(
        series_list: list, prior_list: list
    ) -> torch.Tensor:
        """
        Compute association discrepancy: symmetric KL between prior & series.
        
        Higher discrepancy → more likely anomaly.
        
        Returns:
            discrepancy: (batch, seq_len) per-timestep scores
        """
        total_discrepancy = 0.0
        
        for series, prior in zip(series_list, prior_list):
            # series, prior: (batch, n_heads, seq_len, seq_len)
            # Clamp for numerical stability
            series_clamped = torch.clamp(series, min=1e-8)
            prior_clamped = torch.clamp(prior, min=1e-8)
            
            # KL(prior || series) per row
            kl_ps = (prior_clamped * (prior_clamped.log() - series_clamped.log())).sum(dim=-1)
            # KL(series || prior) per row
            kl_sp = (series_clamped * (series_clamped.log() - prior_clamped.log())).sum(dim=-1)
            
            # Symmetric KL, averaged over heads
            sym_kl = (kl_ps + kl_sp).mean(dim=1)  # (batch, seq_len)
            total_discrepancy = total_discrepancy + sym_kl
        
        return total_discrepancy / len(series_list)
    
    @staticmethod
    def loss_function(
        recon_x: torch.Tensor,
        x: torch.Tensor,
        series_list: list,
        prior_list: list,
        lambda_ad: float = 1.0,
    ) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """
        Combined loss: Reconstruction + Association Discrepancy.
        
        The minimax training strategy:
        - Minimize reconstruction loss (encourage accurate reconstruction)
        - Maximize association discrepancy for better anomaly separation
        """
        recon_loss = F.mse_loss(recon_x, x, reduction="mean")
        
        ad = AnomalyTransformerModel.association_discrepancy(series_list, prior_list)
        ad_loss = ad.mean()
        
        # During training, we minimize recon and maximize discrepancy
        total_loss = recon_loss - lambda_ad * ad_loss
        
        return total_loss, recon_loss, ad_loss
    
    def compute_anomaly_score(self, x: torch.Tensor) -> np.ndarray:
        """
        Compute per-sample anomaly scores.
        
        Combines reconstruction error + association discrepancy.
        """
        self.eval()
        with torch.no_grad():
            recon, series_list, prior_list = self.forward(x)
            
            # Reconstruction error per sample
            recon_error = F.mse_loss(recon, x, reduction="none").mean(dim=(1, 2))
            
            # Association discrepancy per sample (mean over timesteps)
            ad = self.association_discrepancy(series_list, prior_list).mean(dim=1)
            
            # Combined score
            scores = recon_error + ad
        
        return scores.cpu().numpy()
