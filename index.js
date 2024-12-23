const express = require('express')
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
require('dotenv').config()
const jwt = require('jsonwebtoken')
const cookieParser=require('cookie-parser')
const moment = require('moment');

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
const reviewsCollection = client.db('hotelDB').collection('reviews'); 

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
    
    //get featured data from db
    app.get('/featured-rooms', async (req, res) => {
      try {
        const result = await roomsCollection.find().sort({ price: -1 }).limit(6).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Error fetching rooms', error });
      }
    });
    
     //get a single rooms data by id from db
     app.get('/rooms/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await roomsCollection.findOne(query)
      res.send(result)
    })

    //post booking data in db
    app.post('/add-booking', async (req, res) => {
      const bookingData = req.body;
      const { roomNo, status } = bookingData; // Assuming `roomNo` is the identifier for the room
  
      try {
          // Insert booking data into bookingsCollection
          const bookingResult = await bookingsCollection.insertOne(bookingData);
  
          // Update the status of the room in roomsCollection
          const roomUpdateResult = await roomsCollection.updateOne(
              { roomNo: roomNo }, // Filter by room number
              { $set: { status: status } } // Update the status field
          );
  
          res.send({ bookingResult, roomUpdateResult });
      } catch (err) {
          console.error('Error processing booking:', err);
          res.status(500).send({ error: 'Failed to process booking', details: err.message });
      }
  });
  
 //get all bookings posted by a specific user
 app.get('/bookings/:email',verifyToken, async (req, res) => {
  const email = req.params.email;
  const decodedEmail=req.user?.email;

 
  if(decodedEmail!==email){
    return res.status(403).send({message:'forbidden access'})
  }
  const query = {  email }
 
  const result = await bookingsCollection.find(query).toArray()
  res.send(result)
})
    
    //delete a booking from db
    app.delete('/booking/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
  
      try {
          // Find the booking to retrieve the room number and check-in date
          const booking = await bookingsCollection.findOne({ _id: new ObjectId(id) });
  
          if (!booking) {
              return res.status(404).send({ message: 'Booking not found' });
          }
  
          const roomNo = booking.roomNo;
          const checkInDate = moment(booking.checkInDate); // Parse check-in date using moment.js
          const currentDate = moment(); // Current date and time
  
          // Check if the cancellation is allowed (at least 1 day before check-in)
          if (currentDate.isAfter(checkInDate.subtract(1, 'days'))) {
               res.status(201).send({ message: 'Cancellation is not allowed within 1 day of the check-in date.' });
          }else{
            // Delete the booking
          const deleteResult = await bookingsCollection.deleteOne({ _id: new ObjectId(id) });
  
          if (deleteResult.deletedCount === 0) {
              return res.status(500).send({ message: 'Failed to delete booking' });
          }
  
          // Update the room status to "Available" in roomsCollection
          const updateResult = await roomsCollection.updateOne(
              { roomNo: roomNo },
              { $set: { status: 'Available' } }
          );
  
          if (updateResult.matchedCount === 0) {
              return res.status(500).send({ message: 'Failed to update room status' });
          }
  
          // If all operations are successful, send the success response
          res.status(200).send({ message: 'Booking deleted and room status updated successfully.' });
          }
  
          
      } catch (error) {
          console.error('Error deleting booking:', error);
          res.status(500).send({ message: 'Internal server error' });
      }
  });
  


   // POST review data in DB
app.post('/reviews', verifyToken, async (req, res) => {
  const reviewData = req.body;
  const { roomNo, userEmail } = reviewData;

  // Check if a review already exists
  const query = { email: userEmail, roomNo: roomNo };
  
  try {
    const alreadyExist = await reviewsCollection.findOne(query);
    console.log('Query:', query);
    console.log('Exist:', alreadyExist);

    if (alreadyExist) {
      return res.status(400).json({ message: 'You have already placed a review for this room.' });
    }

    // Insert the review
    const result = await reviewsCollection.insertOne(reviewData);
    console.log('Review inserted:', result);

    // Increment review count in roomsCollection
    const filter = { roomNo: roomNo };
    const update = { $inc: { reviewCount: 1 } };
    const updateResult = await roomsCollection.updateOne(filter, update);

    console.log('Room updated:', updateResult);
    res.json({ message: 'Review submitted successfully', result });
  } catch (error) {
    console.error('Error submitting review:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

//get single room reviews
app.get('/reviewDatas/:roomNo', async (req, res) => {
  const roomNo =parseInt( req.params.roomNo ) ;

  const query = {roomNo};
 
  
  const reviews = await reviewsCollection.find(query).toArray(); 

  res.send(reviews);
});

         // Get all rooms data from db for filter

    
app.get('/all-rooms', async (req, res) => {
  try {
    const filter = req.query.filter; 
    const query = {}; 

    
    let options = {};
    if (filter === 'asc' || filter === 'dsc') {
      options.sort = { price: filter === 'asc' ? 1 : -1 }; 
    }

    
    const result = await roomsCollection.find(query, options).toArray();

    res.send(result);
  } catch (error) {
    console.error("Error fetching filtered rooms:", error);
    res.status(500).send({ message: "An error occurred while fetching rooms." });
  }
});

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
