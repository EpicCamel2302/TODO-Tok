-- TODO: Add indexes for better performance
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL
);

-- FIXME: Add proper foreign key constraints
CREATE TABLE posts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    content TEXT
);

-- TODO_OPTIMIZE: Consider partitioning for large datasets
CREATE TABLE logs (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    action VARCHAR(50),
    user_id INTEGER
);

-- REVIEW: Check if this query is optimal
SELECT u.username, COUNT(p.id) as post_count
FROM users u
LEFT JOIN posts p ON u.id = p.user_id
GROUP BY u.username;
