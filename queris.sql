


CREATE TABLE users (
id SERIAL PRIMARY KEY,
username VARCHAR(255),
password VARCHAR(255),
name VARCHAR(255),
surname  VARCHAR(255),
age INT,
tel INT,
profilimg VARCHAR DEFAULT 'defaultprofil.jpeg'
)



CREATE TABLE mealblog (
    id SERIAL PRIMARY KEY,
    mealname VARCHAR(255) NOT NULL,
    mealing TEXT NOT NULL,
    mealwritter VARCHAR(255),
    mealinst TEXT NOT NULL,
    secret TEXT, 
    likes INT DEFAULT 0,                  
    dislikes INT DEFAULT 0, 
    mealimg VARCHAR(255) NOT NULL,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
