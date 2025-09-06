const express = require('express');
const cookieParser = require("cookie-parser");
const cors = require("cors");   // ✅ เพิ่ม

const app = express();
const port = 3000;

// ✅ Config CORS
app.use(cors());

app.use(express.json()); 
app.use(cookieParser());

const authRoutes = require('./routes/auth');
const shorturlRoutes = require('./routes/shorturl');

app.use('/auth', authRoutes);
app.use('/', shorturlRoutes);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});