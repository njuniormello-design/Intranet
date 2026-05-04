USE intranet_db;

UPDATE users
SET role = 'admin'
WHERE username IN ('admin', 'nelson.junior')
   OR email IN ('admin@intranet.com', 'nelson.junior@iluminacao.net.br');

SELECT id, username, email, name, role
FROM users
WHERE username IN ('admin', 'nelson.junior')
   OR email IN ('admin@intranet.com', 'nelson.junior@iluminacao.net.br');
