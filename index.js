const express = require('express');
const cookieParser = require("cookie-parser");
const cors = require("cors");

const app = express();
const port = 3000;

// ✅ Config CORS ให้รับทุก origin + credentials
app.use(cors({
  origin: "http://135.202.71.133:80",
  credentials: true
}));


app.use(express.json());
app.use(cookieParser());

const authRoutes = require('./routes/auth');
const shorturlRoutes = require('./routes/shorturl');

app.use('/auth', authRoutes);
app.use('/', shorturlRoutes);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
