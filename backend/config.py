import os
from datetime import timedelta

BASE_DIR = os.path.abspath(os.path.dirname(__file__))

class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "stockghost-super-secret-key-2025")
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "stockghost-jwt-secret-key-2025")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(days=7)
    
    # Defaults to local SQLite database in backend directory for zero-friction setup,
    # or can connect to MySQL via DATABASE_URL: mysql+pymysql://user:password@localhost/stockghost
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL",
        f"sqlite:///{os.path.join(BASE_DIR, 'stockghost.db')}"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
