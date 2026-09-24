import urllib.request
import zipfile
import os

from server.config import RAW_DATA_DIR

url = "https://storage.googleapis.com/tensorflow/tf-keras-datasets/jena_climate_2009_2016.csv.zip"
zip_path = os.path.join(RAW_DATA_DIR, "jena_climate.zip")
extract_path = RAW_DATA_DIR

print("Downloading Jena Climate dataset...")
urllib.request.urlretrieve(url, zip_path)
print("Download complete. Extracting...")

with zipfile.ZipFile(zip_path, 'r') as zip_ref:
    zip_ref.extractall(extract_path)

print("Extraction complete.")
os.remove(zip_path)
print("Done!")
