const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
dotenv.config();
const app = express();
const port = process.env.PORT || 5000;

//  Middleware
app.use(cors());
app.use(express.json());
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@brainbazzdatabase.ihuzu7m.mongodb.net/?retryWrites=true&w=majority&appName=BrainBazzDatabase`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db("techloomaDB");
    const productsCollection = db.collection("products");
    const usersCollection = db.collection("users");
    const couponsCollection = db.collection("coupons");
    const paymentsCollection = db.collection("payments");
    const reviewsCollection = db.collection("reviews");

    // ------------------------------------payments collection---------------------------------------------

    // payment intent
    app.post("/create-payment-intent", async (req, res) => {
      try {
        const { amountInCents } = req.body;

        const paymentIntent = await stripe.paymentIntents.create({
          amount: amountInCents,
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.send({ clientSecret: paymentIntent.client_secret });
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Stripe payment intent failed." });
      }
    });

    //post the payment data
    app.post("/payments", async (req, res) => {
      try {
        const paymentData = req.body;
        const result = await paymentsCollection.insertOne(paymentData);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to save payment." });
      }
    });

    // ------------------------------------coupons collection----------------------------------------------

    // get all coupons
    app.get("/coupons", async (req, res) => {
      const result = await couponsCollection
        .find()
        .sort({ createDate: -1 })
        .toArray();
      res.send(result);
    });

    // coupon validation
    app.get("/validate-coupon/:code", async (req, res) => {
      const code = req.params.code;
      const today = new Date();

      try {
        const coupon = await couponsCollection.findOne({ code });

        if (!coupon) {
          return res.status(404).send({ message: "Invalid coupon" });
        }

        if (new Date(coupon.expiryDate) < today) {
          return res.status(400).send({ message: "Coupon expired" });
        }

        res.send({ discount: Number(coupon.discount) }); // discount in cents
      } catch (error) {
        res.status(500).send({ message: "Error validating coupon" });
      }
    });

    // CREATE Coupon
    app.post("/coupons", async (req, res) => {
      const newCoupon = req.body;
      const result = await couponsCollection.insertOne(newCoupon);
      res.send(result);
    });

    // UPDATE a coupon
    app.put("/coupons/:id", async (req, res) => {
      const id = req.params.id;
      const updated = req.body;
      const result = await couponsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updated }
      );
      res.send(result);
    });

    // DELETE a coupon
    app.delete("/coupons/:id", async (req, res) => {
      const id = req.params.id;
      const result = await couponsCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });
    // ------------------------------------Users collection------------------------------------------------

    // get all users
    app.get("/users", async (req, res) => {
      try {
        const result = await usersCollection.find().toArray();
        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to fetch users" });
      }
    });

    // Get Single User Info
    app.get("/users/:email", async (req, res) => {
      try {
        const { email } = req.params;
        const user = await usersCollection.findOne({ email });
        res.send(user);
      } catch (error) {
        res.status(500).send({ message: "Error fetching user data" });
      }
    });

    // GET: /users/role/:email and user this code custom hook useUserRole
    app.get("/users/role/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const user = await usersCollection.findOne({ email });

        if (!user) {
          return res.status(404).send({ role: null });
        }

        res.send({ role: user?.role });
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to fetch role" });
      }
    });

    // update role in user
    app.patch("/users/role/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { role } = req.body;
        const query = { _id: new ObjectId(id) };
        const updateRole = {
          $set: { role },
        };

        const result = await usersCollection.updateOne(query, updateRole);
        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to update role" });
      }
    });

    // update subscribe
    app.patch("/users/subscribe/:email", async (req, res) => {
      const email = req.params.email;
      const result = await usersCollection.updateOne(
        { email },
        { $set: { subscribed: true } }
      );
      res.send(result);
    });

    // Save user to DB (if not already exists)
    app.post("/users", async (req, res) => {
      try {
        const user = req.body;
        const existingUser = await usersCollection.findOne({
          email: user.email,
        });

        if (existingUser) {
          return res.send({ message: "User already exists" });
        }

        user.role = "user";
        user.created_At = new Date();
        user.last_log_in = new Date();

        const result = await usersCollection.insertOne(user);
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to save user" });
      }
    });

    // ------------------------------------Products collection---------------------------------------------

    // products page /accepted products→ with tag search + pagination
    app.get("/products/accepted", async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = 1;
        const skip = (page - 1) * limit;
        const search = req.query.search || "";

        const query = {
          status: "accepted",
          tags: { $regex: search, $options: "i" },
        };

        const total = await productsCollection.countDocuments(query);

        const products = await productsCollection
          .find(query)
          .skip(skip)
          .limit(limit)
          .sort({ create_At: -1 })
          .toArray();

        res.send({
          total,
          page,
          totalPages: Math.ceil(total / limit),
          products,
        });
      } catch (err) {
        res.status(500).send({ message: "Failed to load accepted products" });
      }
    });

    // GET My Products
    app.get("/products", async (req, res) => {
      try {
        const email = req.query.email;
        const query = { ownerEmail: email };
        const result = await productsCollection
          .find(query)
          .sort({
            create_At: -1,
          })
          .toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).send({ error: "Failed to fetch products" });
      }
    });

    // Get all products sorted for moderator
    app.get("/moderator/products", async (req, res) => {
      try {
        const pipeline = [
          {
            $addFields: {
              sortOrder: {
                $switch: {
                  branches: [
                    { case: { $eq: ["$status", "pending"] }, then: 0 },
                    { case: { $eq: ["$status", "accepted"] }, then: 1 },
                    { case: { $eq: ["$status", "rejected"] }, then: 2 },
                  ],
                  default: 3,
                },
              },
            },
          },
          { $sort: { sortOrder: 1, create_At: -1 } }, // Sort pending first, then latest
        ];

        const result = await productsCollection.aggregate(pipeline).toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching moderator products:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    // Get all reported products maintain moderator
    app.get("/products/reported", async (req, res) => {
      try {
        const reportedProducts = await productsCollection
          .find({ isReported: true })
          .sort({ reportCount: -1 })
          .toArray();
        res.send(reportedProducts);
      } catch (error) {
        console.error("Error fetching reported products:", error);
        res.status(500).send({ message: "Failed to fetch reported products." });
      }
    });

    // get product by id
    app.get("/products/:id", async (req, res) => {
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      const result = await productsCollection.findOne(query);
      res.send(result);
    });

    // PUT: Update a product by ID
    app.put("/products/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const updatedProduct = req.body;

        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            name: updatedProduct.name,
            description: updatedProduct.description,
            productImage: updatedProduct.productImage,
            tags: updatedProduct.tags,
            externalLink: updatedProduct.externalLink,
            updated_At: updatedProduct.updated_At || new Date(),
          },
        };

        const result = await productsCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        console.error("Error updating product:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    // PATCH: Update product status
    app.patch("/products/:id/status", async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;
      const result = await productsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status } }
      );
      res.send(result);
    });

    // PATCH: Mark product as featured
    app.patch("/products/:id/featured", async (req, res) => {
      const id = req.params.id;
      const result = await productsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { isFeatured: true } }
      );
      res.send(result);
    });

    // PATCH /products/:id/vote
    app.patch("/products/:id/vote", async (req, res) => {
      const productId = req.params.id;
      const { userEmail } = req.body;

      try {
        const product = await productsCollection.findOne({
          _id: new ObjectId(productId),
        });

        if (product.votedUsers?.includes(userEmail)) {
          return res.status(400).send({ message: "Already voted" });
        }

        const result = await productsCollection.updateOne(
          { _id: new ObjectId(productId) },
          {
            $inc: { vote: 1 },
            $push: { votedUsers: userEmail },
          }
        );

        res.send(result);
      } catch (err) {
        console.error("Vote error:", err);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // report the product
    app.patch("/products/:id/report", async (req, res) => {
      try {
        const productId = req.params.id;
        const { userEmail } = req.body;

        if (!userEmail) {
          return res.status(400).send({ message: "User email is required." });
        }

        // Check if user has already reported this product
        const product = await productsCollection.findOne({
          _id: new ObjectId(productId),
        });

        if (!product) {
          return res.status(404).send({ message: "Product not found." });
        }

        const alreadyReported = product?.reports?.some(
          (report) => report.reporterEmail === userEmail
        );

        if (alreadyReported) {
          return res
            .status(409)
            .send({ message: "You have already reported this product." });
        }

        const reportData = {
          reporterEmail: userEmail,
          reported_At: new Date(),
        };

        const result = await productsCollection.updateOne(
          { _id: new ObjectId(productId) },
          {
            $push: { reports: reportData },
            $set: { isReported: true },
            $inc: { reportCount: 1 },
          }
        );

        res.send(result);
      } catch (error) {
        console.error("Report error:", error);
        res.status(500).send({ message: "Failed to report the product." });
      }
    });

    // POST product - Add a new product
    app.post("/products", async (req, res) => {
      try {
        const product = req.body;
        const userEmail = req.query.ownerEmail;

        // Get user data
        const user = await usersCollection.findOne({ email: userEmail });

        // Count products added by the user
        const existingProductCount = await productsCollection.countDocuments({
          ownerEmail: userEmail,
        });

        // Check membership and limit
        if (!user?.subscribed && existingProductCount >= 1) {
          return res.status(403).send({
            message:
              "You can only add 1 product as a free user. Please subscribe to add more.",
          });
        }

        const result = await productsCollection.insertOne(product);
        res.status(201).send(result);
      } catch (error) {
        console.error("Error adding product:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    // DELETE Product by ID
    app.delete("/products/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const result = await productsCollection.deleteOne(filter);
        res.send(result);
      } catch (error) {
        console.error("Error deleting product:", error);
        res.status(500).send({ error: "Failed to delete product" });
      }
    });

    // ------------------------------------Review collection---------------------------------------------

    // get review for single product
    app.get("/reviews/:productId", async (req, res) => {
      const { productId } = req.params;
      const query = { productId: productId };

      const result = await reviewsCollection
        .find(query)
        .sort({ created_At: -1 })
        .toArray();
      res.send(result);
    });

    // post review
    app.post("/reviews", async (req, res) => {
      const review = req.body;
      const result = await reviewsCollection.insertOne(review);
      res.send(result);
    });

    // ---------------------admin statius page data loading ------------------------------
   app.get("/admin/stats", async (req, res) => {
     try {
       const totalUsers = await usersCollection.estimatedDocumentCount();
       const totalReviews = await reviewsCollection.estimatedDocumentCount();
       const totalProducts = await productsCollection.estimatedDocumentCount();
       const acceptedCount = await productsCollection.countDocuments({
         status: "accepted",
       });
       const pendingCount = await productsCollection.countDocuments({
         status: "pending",
       });

       res.send({
         totalUsers,
         totalReviews,
         totalProducts,
         acceptedCount,
         pendingCount,
       });
     } catch (err) {
       res.status(500).send({ message: "Failed to fetch admin stats" });
     }
   });

    

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

// Root Route
app.get("/", (req, res) => {
  res.send("TechLooma Server is Running...");
});

// Start Server
app.listen(port, () => {
  console.log(`TechLooma server is running on port ${port}`);
});
