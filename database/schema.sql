-- Commercial Multi-Tenant Schema for Smart Checkout / MyCashier Platform
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Commercial Custom Enum Types
CREATE TYPE payment_status_enum AS ENUM ('PENDING', 'COMPLETED', 'FAILED');
CREATE TYPE order_source_enum AS ENUM ('POS', 'WHATSAPP');
CREATE TYPE receipt_channel_enum AS ENUM ('PRINT', 'WHATSAPP', 'SMS', 'HYBRID');
CREATE TYPE user_role_enum AS ENUM ('SUPER_ADMIN', 'STORE_OWNER', 'STORE_MANAGER', 'CASHIER');
CREATE TYPE subscription_status_enum AS ENUM ('TRIAL', 'ACTIVE', 'PAUSED', 'EXPIRED');

-- 1. Businesses / Tenants Table (Every Supermarket client you sell to)
CREATE TABLE businesses (
    id SERIAL PRIMARY KEY,
    business_code VARCHAR(30) UNIQUE NOT NULL, -- e.g., 'KAREN-SUPER'
    business_name VARCHAR(150) NOT NULL,
    owner_name VARCHAR(100) NOT NULL,
    owner_email VARCHAR(100) UNIQUE NOT NULL,
    owner_phone VARCHAR(20) NOT NULL,
    subscription_status subscription_status_enum DEFAULT 'TRIAL',
    subscription_expires_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP + INTERVAL '14 days',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Business M-Pesa Credentials (Each store's own Paybill/Till integration)
CREATE TABLE business_mpesa_configs (
    id SERIAL PRIMARY KEY,
    business_id INT REFERENCES businesses(id) ON DELETE CASCADE,
    shortcode VARCHAR(20) NOT NULL, -- Paybill or Till Number
    consumer_key VARCHAR(255) NOT NULL,
    consumer_secret VARCHAR(255) NOT NULL,
    passkey VARCHAR(255) NOT NULL,
    is_live BOOLEAN DEFAULT FALSE, -- FALSE = Sandbox, TRUE = Live Production
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Branches Table (Supports multi-branch clients e.g., Karen Branch, Westlands Branch)
CREATE TABLE branches (
    id SERIAL PRIMARY KEY,
    business_id INT REFERENCES businesses(id) ON DELETE CASCADE,
    branch_name VARCHAR(100) NOT NULL,
    location VARCHAR(150),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Users / Cashiers / Admins Table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    business_id INT REFERENCES businesses(id) ON DELETE CASCADE,
    branch_id INT REFERENCES branches(id) ON DELETE SET NULL,
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    pin_hash VARCHAR(255) NOT NULL, -- Encrypted login PIN using bcrypt
    role user_role_enum DEFAULT 'CASHIER',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Multi-Tenant Live Transactions Table
CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    business_id INT REFERENCES businesses(id) ON DELETE CASCADE,
    branch_id INT REFERENCES branches(id) ON DELETE CASCADE,
    cashier_id INT REFERENCES users(id) ON DELETE SET NULL,
    invoice_no VARCHAR(50) NOT NULL,
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    phone_number VARCHAR(20) NOT NULL,
    status payment_status_enum DEFAULT 'PENDING',
    source order_source_enum DEFAULT 'POS',
    mpesa_checkout_request_id VARCHAR(100) UNIQUE,
    mpesa_receipt_number VARCHAR(50),
    receipt_channel receipt_channel_enum DEFAULT 'PRINT',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(business_id, invoice_no) -- Invoice numbers unique per business
);

-- High-Concurrency Performance Indexes for Callback Listeners
CREATE INDEX idx_transactions_checkout_id ON transactions(mpesa_checkout_request_id);
CREATE INDEX idx_transactions_business_status ON transactions(business_id, status);

-- 6. Transaction Items Table
CREATE TABLE transaction_items (
    id SERIAL PRIMARY KEY,
    transaction_id INT REFERENCES transactions(id) ON DELETE CASCADE,
    product_name VARCHAR(150) NOT NULL,
    quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL
);

-- 7. Pending Payments Queue (Cashier Protection Engine)
CREATE TABLE pending_payments (
    id SERIAL PRIMARY KEY,
    business_id INT REFERENCES businesses(id) ON DELETE CASCADE,
    transaction_id INT REFERENCES transactions(id) ON DELETE CASCADE,
    phone_number VARCHAR(20) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    is_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. Cashier Shift Reconciliation Table (End of Shift "Anti-Shot" Audit)
CREATE TABLE cash_reconciliation (
    id SERIAL PRIMARY KEY,
    business_id INT REFERENCES businesses(id) ON DELETE CASCADE,
    branch_id INT REFERENCES branches(id) ON DELETE CASCADE,
    cashier_id INT REFERENCES users(id) ON DELETE RESTRICT,
    opening_float DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    cash_sales DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    mpesa_sales DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    expected_cash DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    actual_cash DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    difference DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    shift_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
-- 9. WhatsApp Order Metadata (transaction and transaction_items remain the order source of truth)
CREATE TABLE whatsapp_orders (
    id SERIAL PRIMARY KEY,
    transaction_id INT NOT NULL UNIQUE REFERENCES transactions(id) ON DELETE CASCADE,
    customer_name VARCHAR(150),
    whatsapp_message_id VARCHAR(100),
    confirmation_sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_whatsapp_orders_transaction_id ON whatsapp_orders(transaction_id);