const express = require('express')
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
require('dotenv').config()
const jwt = require('jsonwebtoken')
const cookieParser=require('cookie-parser')

const port = process.env.PORT || 3000
const app = express()

const corsOptions = {
  origin: ['http://localhost:5174',
   'http://localhost:5173'
  ], //live link o hbe akhane
  credentials: true,
  optionalSuccessStatus: 200,
}
app.use(cors(corsOptions))
app.use(express.json())
app.use(cookieParser());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.zlou2.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})

//verifyToken
const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;
  // console.log('token inside the verify token', token);
if(!token){
  return res.status(401).send({message:'Unauthorized access'})
}
jwt.verify(token,process.env.SECRET_KEY,(err,decoded)=>{
  if(err){
  return res.status(401).send({message:'Unauthorized access'})

  }
  req.user=decoded;
})
  next()
}
async function run() {
  try {
    const roomsCollection = client.db('hotelDB').collection('rooms');
    const bookingsCollection = client.db('hotelDB').collection('bookings'); 

    //generate jwt
    app.post('/jwt', async (req, res) => {
      const email = req.body;
      //create token
      const token = jwt.sign(email, process.env.SECRET_KEY, { expiresIn: '365d' })
      // console.log(token);
      res
        .cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .send({ success: true })

    })

    //clear cookie from browser for logout
    app.get('/logout', async (req, res) => {
      res
        .clearCookie('token', {
          maxAge: 0,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .send({ success: true })
    })
    //get all rooms data from db
    app.get('/rooms', async (req, res) => {
      const result = await roomsCollection.find().toArray()
      res.send(result)
    })
    
    // Send a ping to confirm a successful connection
    // await client.db('admin').command({ ping: 1 })
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    )
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir)
app.get('/', (req, res) => {
  res.send('Hello from SuiteSpot Server....')
})

app.listen(port, () => console.log(`Server running on port ${port}`))
