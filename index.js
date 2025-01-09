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
   'http://localhost:5173',
   'http://localhost:5175',

   'https://suitespot-719f8.web.app',
   'https://suitespot-719f8.firebaseapp.com'
  ],
  credentials: true,
  optionalSuccessStatus: 200,
}
app.use(cors(corsOptions))
app.use(express.json())
app.use(cookieParser());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.zlou2.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;


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
      try {
        // Fetch all rooms
        const rooms = await roomsCollection.find().toArray();
    
        const bookings = await bookingsCollection.find().toArray();
    
        const roomsWithBookings = rooms.map(room => {
          const roomBookings = bookings.filter(booking => booking.roomNo === room.roomNo);
    
          // Add booking info to the room object
          room.bookings = roomBookings.map(booking => ({
            checkInDate: booking.checkInDate,
            checkOutDate: booking.checkOutDate
          }));
          return room;
        });
        // Send rooms with the bookings data
        res.send(roomsWithBookings);
      } catch (error) {
        console.error('Error fetching rooms and bookings:', error);
        res.status(500).send('Error fetching rooms and bookings');
      }
    });
    
    //get featured data from db
    app.get('/featured-rooms', async (req, res) => {
      try {
        const result = await roomsCollection.find().sort({ price: -1 }).limit(8).toArray();
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
      const { roomNo, checkInDate, checkOutDate } = bookingData;
  
      try {
         
          const checkIn = moment(checkInDate);
          const checkOut = moment(checkOutDate);
  
        
          const existingBooking = await bookingsCollection.findOne({
              roomNo: roomNo,
              $or: [
                  {
                      $and: [
                          { checkInDate: { $lte: checkOut.toISOString() } },
                          { checkOutDate: { $gte: checkIn.toISOString() } }
                      ]
                  }
              ]
          });
  
          if (existingBooking) {
              return res.status(409).send({ message: "This date is already booked for this room" });
          }
  
         
          const bookingResult = await bookingsCollection.insertOne(bookingData);
          res.send(bookingResult);
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
       
          const booking = await bookingsCollection.findOne({ _id: new ObjectId(id) });
  
          if (!booking) {
              return res.status(404).send({ message: 'Booking not found' });
          }
  
          const roomNo = booking.roomNo;
          const checkInDate = moment(booking.checkInDate); 
          const currentDate = moment();
  
          // Check if the cancellation is allowed (at least 1 day before check-in)

          if (currentDate.isAfter(checkInDate.subtract(1, 'days'))) {
               res.status(201).send({ message: 'Cancellation is not allowed within 1 day of the check-in date.' });
          }else{
        
          const deleteResult = await bookingsCollection.deleteOne({ _id: new ObjectId(id) });
  
          if (deleteResult.deletedCount === 0) {
              return res.status(500).send({ message: 'Failed to delete booking' });
          }
  
               
          res.status(200).send({ message: 'Booking deleted  successfully.' });
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

  try {
    // Check if a review already exists
    const query = { userEmail: userEmail, roomNo: roomNo };
    const alreadyExist = await reviewsCollection.findOne(query);


    if (alreadyExist) {
     return  res
        .status(201)
        .send({ message: 'You have already placed a review for this room.' });
    }

    // Insert the review
    const result = await reviewsCollection.insertOne(reviewData);
   

    // Increment review count in roomsCollection
    const filter = { roomNo: roomNo };
    const update = { $inc: { reviewCount: 1 } };
    const updateResult = await roomsCollection.updateOne(filter, update);

    
    res.send({ message: 'Review submitted successfully', result });
  } catch (error) {
    console.error('Error submitting review:', error);
    res.status(500).send({ message: 'Internal server error' });
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
    const { filter, offer, fromDate, toDate } = req.query;

    const query = {};
    const options = {};

    if (filter === 'asc' || filter === 'dsc') {
      options.sort = { price: filter === 'asc' ? 1 : -1 };
    }
    if (offer) {
      query.discount = offer;
    }

    if (fromDate && toDate) {
         const checkIn = moment(fromDate);
          const checkOut = moment(toDate);
  
          const existingBooking = await bookingsCollection.find({
              $or: [
                  {
                      $and: [
                          { checkInDate: { $lte: checkOut.toISOString() } },
                          { checkOutDate: { $gte: checkIn.toISOString() } }
                      ]
                  }
              ]
          })
        .project({ roomNo: 1 })
        .toArray();
  
      const bookedRoomNumbers = existingBooking.map((booking) => booking.roomNo);
      
      
      if (bookedRoomNumbers.length > 0) {
        query.roomNo = { $nin: bookedRoomNumbers }; 
      }
    }

    // Fetch filtered rooms
    const result = await roomsCollection.find(query, options).toArray();
    res.send(result);
  } catch (error) {
    console.error('Error fetching filtered rooms:', error);
    res.status(500).send({ message: 'An error occurred while fetching rooms.' });
  }
});



  //get review data from db
  app.get('/top-reviews', async (req, res) => {
    try {
      const result = await reviewsCollection
        .find()
        .sort({ currentTime: -1 }) 
        .toArray();
      res.send(result);
    } catch (error) {
      res.status(500).send({ message: 'Error fetching reviews', error });
    }
  });

//update booking date
app.put('/update-date',verifyToken, async (req, res) => {
  const updateData = req.body;
  const { id, roomNo, checkInDate, checkOutDate } = updateData;

  try {
   

const checkIn = moment(checkInDate);
const checkOut = moment(checkOutDate);


const existingBooking = await bookingsCollection.findOne({
    roomNo: roomNo,
    $or: [
        {
            $and: [
                { checkInDate: { $lte: checkOut.toISOString() } },
                { checkOutDate: { $gte: checkIn.toISOString() } }
            ]
        }
    ]
});



if (existingBooking) {
    
    return res.status(201).send({ message: "This date is already booked for this room" });
}


    
    const result = await bookingsCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          checkInDate: checkInDate,
          checkOutDate: checkOutDate,
        },
      }
    );

    // If the update is successful
    if (result.modifiedCount > 0) {
      res.status(200).send({ message: 'Booking dates updated successfully.' });
    } else {
      res.status(404).send({ message: 'Booking not found or no changes made.' });
    }

  } catch (error) {
    console.error('Error updating booking dates:', error);
    res.status(500).send({ message: 'Internal server error. Please try again later.' });
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
