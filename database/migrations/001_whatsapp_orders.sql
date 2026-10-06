CREATE TABLE IF NOT EXISTS whatsapp_orders (
    id SERIAL PRIMARY KEY,
    transaction_id INT NOT NULL UNIQUE REFERENCES transactions(id) ON DELETE CASCADE,
    customer_name VARCHAR(150),
    whatsapp_message_id VARCHAR(100),
    confirmation_sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_orders_transaction_id
    ON whatsapp_orders(transaction_id);