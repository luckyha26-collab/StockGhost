from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
from database import db

class User(db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    full_name = db.Column(db.String(100), nullable=True, default='')
    email = db.Column(db.String(120), unique=True, nullable=False)
    phone_number = db.Column(db.String(30), nullable=True, default='')
    password_hash = db.Column(db.String(256), nullable=False)
    # Roles: Admin, Inventory Manager, Sales Manager
    role = db.Column(db.String(50), nullable=False, default='Inventory Manager')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "full_name": self.full_name or self.username,
            "email": self.email,
            "phone_number": self.phone_number or '',
            "role": self.role,
            "created_at": self.created_at.strftime("%Y-%m-%d %H:%M:%S") if self.created_at else None
        }

class Category(db.Model):
    __tablename__ = 'categories'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False)
    description = db.Column(db.String(255))
    holding_cost_rate = db.Column(db.Float, default=0.15)  # e.g., 15% annual carrying cost
    obsolescence_factor = db.Column(db.Float, default=1.0) # Risk multiplier for tech/fast-aging goods
    
    products = db.relationship('Product', backref='category', lazy=True)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "holding_cost_rate": self.holding_cost_rate,
            "obsolescence_factor": self.obsolescence_factor
        }

class Supplier(db.Model):
    __tablename__ = 'suppliers'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    contact_person = db.Column(db.String(100))
    email = db.Column(db.String(120))
    phone = db.Column(db.String(50))
    address = db.Column(db.String(255))
    return_policy = db.Column(db.String(100), default="30 Days Return")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    products = db.relationship('Product', backref='supplier', lazy=True)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "contact_person": self.contact_person,
            "email": self.email,
            "phone": self.phone,
            "address": self.address,
            "return_policy": self.return_policy
        }

class Product(db.Model):
    __tablename__ = 'products'
    
    id = db.Column(db.Integer, primary_key=True)
    sku = db.Column(db.String(50), unique=True, nullable=False)
    name = db.Column(db.String(150), nullable=False)
    description = db.Column(db.Text)
    category_id = db.Column(db.Integer, db.ForeignKey('categories.id'), nullable=True)
    supplier_id = db.Column(db.Integer, db.ForeignKey('suppliers.id'), nullable=True)
    
    cost_price = db.Column(db.Float, nullable=False)        # Unit cost price (e.g. ₹1,500)
    selling_price = db.Column(db.Float, nullable=False)     # Unit retail price (e.g. ₹2,000)
    current_stock = db.Column(db.Integer, default=0)        # Units on hand
    min_stock = db.Column(db.Integer, default=10)           # Safety stock threshold
    
    warehouse_location = db.Column(db.String(50), default="Main Bay A-1")
    first_received_date = db.Column(db.Date, nullable=False) # Inward date for stock age
    last_sale_date = db.Column(db.Date, nullable=True)       # Inactivity tracking
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    sales = db.relationship('SaleTransaction', backref='product', lazy=True, cascade="all, delete-orphan")
    purchases = db.relationship('PurchaseOrder', backref='product', lazy=True, cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "sku": self.sku,
            "name": self.name,
            "description": self.description,
            "category_id": self.category_id,
            "category_name": self.category.name if self.category else "General",
            "supplier_id": self.supplier_id,
            "supplier_name": self.supplier.name if self.supplier else "N/A",
            "cost_price": float(self.cost_price),
            "selling_price": float(self.selling_price),
            "current_stock": int(self.current_stock),
            "min_stock": int(self.min_stock),
            "warehouse_location": self.warehouse_location,
            "first_received_date": self.first_received_date.strftime("%Y-%m-%d") if self.first_received_date else None,
            "last_sale_date": self.last_sale_date.strftime("%Y-%m-%d") if self.last_sale_date else None,
            "total_inventory_value": float(self.cost_price * self.current_stock)
        }

class PurchaseOrder(db.Model):
    __tablename__ = 'purchase_orders'
    
    id = db.Column(db.Integer, primary_key=True)
    order_number = db.Column(db.String(50), unique=True, nullable=False)
    supplier_id = db.Column(db.Integer, db.ForeignKey('suppliers.id'), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey('products.id'), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)
    unit_cost = db.Column(db.Float, nullable=False)
    total_cost = db.Column(db.Float, nullable=False)
    purchase_date = db.Column(db.Date, nullable=False)
    status = db.Column(db.String(50), default="Received") # Ordered, In-Transit, Received

    def to_dict(self):
        return {
            "id": self.id,
            "order_number": self.order_number,
            "supplier_id": self.supplier_id,
            "product_id": self.product_id,
            "quantity": self.quantity,
            "unit_cost": self.unit_cost,
            "total_cost": self.total_cost,
            "purchase_date": self.purchase_date.strftime("%Y-%m-%d"),
            "status": self.status
        }

class SaleTransaction(db.Model):
    __tablename__ = 'sale_transactions'
    
    id = db.Column(db.Integer, primary_key=True)
    invoice_number = db.Column(db.String(50), unique=True, nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey('products.id'), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)
    unit_price = db.Column(db.Float, nullable=False)
    discount_percent = db.Column(db.Float, default=0.0)
    total_amount = db.Column(db.Float, nullable=False)
    sale_date = db.Column(db.Date, nullable=False)
    channel = db.Column(db.String(50), default="Retail POS")

    def to_dict(self):
        return {
            "id": self.id,
            "invoice_number": self.invoice_number,
            "product_id": self.product_id,
            "quantity": self.quantity,
            "unit_price": self.unit_price,
            "discount_percent": self.discount_percent,
            "total_amount": self.total_amount,
            "sale_date": self.sale_date.strftime("%Y-%m-%d"),
            "channel": self.channel
        }

class Recommendation(db.Model):
    __tablename__ = 'recommendations'
    
    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey('products.id'), nullable=False)
    action_type = db.Column(db.String(100), nullable=False) # Clearance Discount, Bundle, Liquidation, Return to Supplier
    title = db.Column(db.String(200), nullable=False)
    details = db.Column(db.Text, nullable=False)
    expected_recovery = db.Column(db.Float, default=0.0)
    discount_percent = db.Column(db.Float, default=0.0)
    priority = db.Column(db.String(20), default="High")     # High, Medium, Low
    status = db.Column(db.String(20), default="Pending")    # Pending, Applied, Dismissed
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    product = db.relationship('Product', backref='recommendations', lazy=True)

    def to_dict(self):
        return {
            "id": self.id,
            "product_id": self.product_id,
            "product_name": self.product.name if self.product else "Unknown",
            "action_type": self.action_type,
            "title": self.title,
            "details": self.details,
            "expected_recovery": self.expected_recovery,
            "discount_percent": self.discount_percent,
            "priority": self.priority,
            "status": self.status,
            "created_at": self.created_at.strftime("%Y-%m-%d %H:%M:%S") if self.created_at else None
        }
