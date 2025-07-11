const express = require('express');
const cors=require('cors')
const dotenv = require("dotenv");
dotenv.config();
const app = express();
const port = process.env.PORT || 5000;


//  Middleware
app.use(cors());
app.use(express.json());







// Root Route
app.get("/", (req, res) => {
  res.send("TechLooma Server is Running...");
});

// Start Server
app.listen(port, () => {
  console.log(`AppOrbit server is running on port ${port}`);
});