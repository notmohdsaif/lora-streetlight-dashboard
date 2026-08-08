require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => res.status(200).send('ok'));

const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Dashboard listening on ${PORT}`));
