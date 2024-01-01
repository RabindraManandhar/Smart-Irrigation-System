'use strict'

const express = require('express')
const http = require('http')
const WebSocket = require('ws')
const mqtt = require('mqtt')
const path = require('path')
const sqlite3 = require('sqlite3').verbose()

const app = express()
app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))
const server = http.createServer(app)
const wss = new WebSocket.Server({server})
const brokerUrl = 'mqtt:localhost'
//const brokerUrl = 'mqtt://192.168.1.106'
const options = {
  clientId: 'mqtt_subscriber',
  clean: true,
}
// MQTT Connect
const client = mqtt.connect(brokerUrl, options)
let latestSensorData = {}

// Root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})
// Statistics page route
app.get('/statistics', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'data.html'))
})
// Profile page route
app.get('/profiles', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'profiles.html'))
})

// Publish to topics
client.on('connect', () => {
  client.subscribe('status', (err) => {
    if (err) console.error('Error subscribing:', err)
    else console.log('Subscribed to status')
  })
})
/*
  On status message, get the current selected profile from the database and sent the received MQTT data to the measurement table with the profile entry.
  If there is no selected profile, it skips the measurement table insert and goes on to send data through websocket
*/
client.on('message', (topic, message) => {
  if (topic === 'status') {
    const data = JSON.parse(message.toString())
    latestSensorData = data
    let date = new Date()
    let time_stamp = date.getTime()
    console.log(latestSensorData)
    // Assuming 'profile' represents the currently selected profile from the profiles page
    const { water, light, moisture, errors, mode } = latestSensorData
    if(errors == 0){

    
    db.get('SELECT * FROM profile WHERE selected = ?', [true], (err, selectedProfile) => {
      if (err) {
        console.error('Error fetching selected profile:', err)
        return
      }
      try {
        if (selectedProfile.name !== undefined) {

          // Insert the measurement with the selected profile name
          db.run(
            `INSERT INTO measurement (time_stamp, water, moisture, light, profile) 
            VALUES (?, ?, ?, ?, ?)`,
            [time_stamp, water, moisture, light, selectedProfile.name],
            (err) => {
              if (err) {
                console.error('Error inserting measurement:', err)
              } else {
              }
            }
          )
          }
      } catch(e) {

      }
      
    })
      
    
      }
  }
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(latestSensorData))
    }
  })
})

// WebSocket connection
wss.on('connection', (ws) => {
  ws.send(JSON.stringify(latestSensorData))
})
// Pump route, if there is request, find the selected profile and if it exists send data through mqtt 'set' topic
app.post('/pump', (req, res) => {
  db.get('SELECT * FROM profile WHERE selected = ?', [true], (err, profile) => {
    if (err) {
      console.error(err.message)
      return
    }

    if (profile) {
      const { name, auto, water_timing, target_moisture, amount_of_water } = profile
      const [profileHour, profileMinute] = water_timing.split(':').map(Number)
      
      // Construct the message in JSON format
      const message = JSON.stringify({
        mode: auto, // Auto mode
        moisture: target_moisture, // Target moisture
        water: amount_of_water // Water amount
      })
      console.log(message)

      // Publish the message to the 'set' topic
      client.publish('set', message, function(err) {
        if (err) {
          console.error('Error publishing message:', err)
        } else {
          console.log(`Message published to 'set' topic for ${name}`)
        }
      })
      
    }
  })
})
// Route that can be used for testing with the mqttSimulator. The current version implements the Pico version, so this route isnt used without changing the code
app.post('/irrigate', (req, res) => {
  client.publish('telefarm/irrigate', 'true', function(err) {
    if (err) {
      console.error('Error publishing message:', err)
      res.status(500).send('Error when calling for irrigation')
    } else {
      console.log(`Plant has been watered at [${new Date().toLocaleString()}]`)
    }
  })
})

// Database connection
const db = new sqlite3.Database('data/myDatabase.db', (err) => {
  if (err) {
      console.error(err.message)
  } else {
      console.log('Connected to the SQLite database.')
  }
})
// Database init function in case it needs to be done
function init_db(){
  // Put selected parameter here
  db.run(`CREATE TABLE IF NOT EXISTS profile(
      name TEXT,
      auto BOOLEAN,
      target_moisture INTEGER,
      water_timing TEXT,
      amount_of_water INTEGER,
      selected BOOLEAN
  );`, (error) => {
      if(error){
          console.log(error)
          process.exit()
      } else {
          console.log('Initialized DB')
      }
  })
  db.run(`CREATE TABLE IF NOT EXISTS measurement(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    time_stamp INTEGER,
    water INTEGER,
    moisture INTEGER,
    light INTEGER,
    profile TEXT
    );
`, (error) => {
  if(error){
  console.log(error)
  process.exit()
  }
  else {
  console.log('Initialized DB')
  }
})
}
// selectData route, used to update the select menu
app.get('/selectData', (req, res) => {
  db.all('SELECT name FROM profile', (err, rows) => {
      if (err) {
          res.status(500).json({ error: err.message })
          return
      }
      res.json(rows)
  })
})
// Simple test data for the database in case there is need for it
function insertTestData() {
  const testProfiles = [
      { name: 'John Doe', auto: true, target_moisture: 50, water_timing: '06:00', amount_of_water: 200, selected: false },
      { name: 'Jane Smith', auto: false, target_moisture: 60, water_timing: '12:00', amount_of_water: 150, selected: false },
  ]

  const placeholders = testProfiles.map(() => '(?, ?, ?, ?, ?, ?)').join(',')

  const insertQuery = `
      INSERT INTO profile (name, auto, target_moisture, water_timing, amount_of_water, selected)
      VALUES ${placeholders}
  `;

  const values = testProfiles.reduce((acc, profile) => {
      acc.push(profile.name, profile.auto, profile.target_moisture, profile.water_timing, profile.amount_of_water, profile.selected)
      return acc
  }, [])

  db.run(insertQuery, values, function(err) {
      if (err) {
          console.error(err.message)
          return
      }
      console.log('Test data inserted successfully')
  })
}
// Function to clear the database if there is need for it
function clearDatabase() {
  const clearQuery = `DELETE FROM profile`

  db.run(clearQuery, function(err) {
      if (err) {
          console.error(err.message)
      } else {
          console.log('Database cleared successfully')
      }
  })
  const clearQuery2 = `DELETE FROM measurement`

  db.run(clearQuery2, function(err) {
      if (err) {
          console.error(err.message)
      } else {
          console.log('Database cleared successfully')
      }
  })
}

// Route used when a profile is selected
app.get('/profileData', (req, res) => {
  const selectedName = req.query.name

  db.run('UPDATE profile SET selected = ?', [false], (updateErr) => {
    if (updateErr) {
      res.status(500).json({ error: updateErr.message })
      return
    }

    db.run('UPDATE profile SET selected = ? WHERE name = ?', [true, selectedName], (err) => {
      if (err) {
        res.status(500).json({ error: err.message })
        return
      }

      db.all('SELECT * FROM profile WHERE name = ?', [selectedName], (err, rows) => {
        if (err) {
          res.status(500).json({ error: err.message })
          return
        }

        if (rows.length > 0) {
          const selectedProfile = rows[0]
          const { auto, target_moisture, amount_of_water } = selectedProfile

        }

        res.json(rows)
      })
    })
  })
})


// Route to the create the profile and update it to database
app.post('/createProfile', (req, res) => {
  console.log(req.body)
  const { name, auto, target_moisture, water_timing, amount_of_water } = req.body

  // Check if a profile with the same name exists
  db.get('SELECT name FROM profile WHERE name = ?', [name], (err, row) => {
      if (err) {
          res.status(500).json({ error: err.message })
          return
      }

      if (row) {
          // Profile with the same name already exists
          res.status(400).json({ error: 'Profile with this name already exists' })
          return
      }

      // Insert new profile since no profile with this name exists
      const insertQuery = `
          INSERT INTO profile (name, auto, target_moisture, water_timing, amount_of_water, selected)
          VALUES (?, ?, ?, ?, ?, ?)
      `

      db.run(insertQuery, [name, auto, target_moisture, water_timing, amount_of_water, false], function(err) {
          if (err) {
              res.status(500).json({ error: err.message })
              return
          }
          res.json({ message: 'Profile created successfully' })
      })
  })
})


// Profile deletion route
app.delete('/deleteProfile', (req, res) => {
  const name = req.query.name

  db.run('DELETE FROM profile WHERE name = ?', [name], function(err) {
    if (err) {
      res.status(500).json({ error: err.message })
      return
    }

    if (this.changes === 0) {
      res.json({ success: false }) // Profile not found
      return
    }

    db.run('DELETE FROM measurement WHERE profile = ?', [name], function(err) {
      if (err) {
        res.status(500).json({ error: err.message })
        return
      }

      res.json({ success: true }) // Profile successfully deleted
    })
  })
})


// Route to initialize to clear, init and put sample data to the database for testing purposes
function start(){
  clearDatabase()
  init_db()
  insertTestData()
}
//start()

// Function to log the current profiles on server startup
function printProfiles() {
  db.all('SELECT * FROM profile', (err, rows) => {
    if (err) {
      console.error(err.message)
      return
    }
    console.log('Profiles:')
    console.table(rows) // Prints the retrieved rows in a tabular format
  })
}
printProfiles()

// Route to check if there is a selected profile and if there is it then checks if the time to water is now. If it is, it sends message to 'set' topic through MQTT
function checkWaterTimings() {
  const now = new Date()
  const currentHour = now.getHours()
  const currentMinute = now.getMinutes()

  db.get('SELECT * FROM profile WHERE selected = ? AND auto = ?', [true, false], (err, profile) => {
    if (err) {
      console.error(err.message)
      return
    }

    if (profile) {
      const { name, auto, water_timing, target_moisture, amount_of_water } = profile
      const [profileHour, profileMinute] = water_timing.split(':').map(Number)

      if (profileHour === currentHour && profileMinute === currentMinute) {
        console.log(`Time to water ${name} at ${water_timing}`)
        
        // Construct the message in JSON format
        const message = JSON.stringify({
          mode: auto, // Auto mode
          moisture: target_moisture, // Target moisture
          water: amount_of_water // Water amount
        })

        // Publish the message to the 'set' topic
        client.publish('set', message, function(err) {
          if (err) {
            console.error('Error publishing message:', err)
          } else {
            console.log(`Message published to 'set' topic for ${name}`)
          }
        })
      }
    }
  })
}


// Execute the function every minute (60,000 milliseconds)
setInterval(checkWaterTimings, 60000) // Runs every minute


// Route to get data from the measurement table
app.get('/statistics/data', async (req, res) => {
  let parameters = ['time_stamp']
  console.log(req.query)

  if (req.query.water) {
    parameters.push('water')
  }
  if (req.query.moisture) {
    parameters.push('moisture')
  }
  if (req.query.light) {
    parameters.push('light')
  }

  try {
    let data = await get_data(parameters, req.query.start, req.query.end)
    //console.log(data)
    res.send(data)
  } catch (exception) {
    console.log(exception)

    res.sendStatus(500)
  }
})

// Asynchronous helper function for the /statistics/data route. Finds data from thea measurement table from the given timestamps
async function get_data(parameters, start, end) {
  return new Promise((resolve, reject) => {
    const selectedProfileQuery = 'SELECT name FROM profile WHERE selected = ?'
    // Fetch the selected profile name
    db.get(selectedProfileQuery, [true], (err, selectedProfile) => {
      if (err) {
        reject(err)
        return
      }

      if (!selectedProfile || !selectedProfile.name) {
        resolve([]) // No selected profile or name found
        return
      }

      let query = `SELECT ${parameters.join(', ')} FROM measurement WHERE profile = ?`

      const queryArgs = [selectedProfile.name]
      console.log(isNaN(start))
      if (!isNaN(start) && !isNaN(start)) {
        query += ' AND time_stamp >= ? AND time_stamp <= ?'
        queryArgs.push(parseInt(start), parseInt(end))
      }
      console.log(query)
      console.log(queryArgs)

      db.all(query, queryArgs, (err, rows) => {
        if (err) {

          reject(err)
          return
        }
        resolve(rows)
      })
    })
  })
}


// Route to modify profile data or name
app.put('/modifyProfile', (req, res) => {
  const { name, auto, target_moisture, water_timing, amount_of_water } = req.body

  // Check if the profile already exists with the given name
  db.get('SELECT name FROM profile WHERE name = ? AND selected != ?', [name, true], (err, profile) => {
    if (err) {
      res.status(500).json({ error: err.message })
      return
    }
    
    if (profile) {
      res.status(400).json({ error: 'Profile with that name already exists' })
      return
    }

    // Update the selected profile
    db.run('UPDATE profile SET name = ?, auto = ?, target_moisture = ?, water_timing = ?, amount_of_water = ? WHERE selected = ?', 
      [name, auto, target_moisture, water_timing, amount_of_water, true], function(updateErr) {
        if (updateErr) {
          res.status(500).json({ error: updateErr.message })
          return
        }

        // Update the corresponding measurements with the new profile name
        db.run('UPDATE measurement SET profile = ? WHERE profile = ?', [name, req.body.name], function(measurementsErr) {
          if (measurementsErr) {
            res.status(500).json({ error: measurementsErr.message })
            return
          }

          res.json({ message: 'Profile updated successfully' })
        })
      }
    )
  })
})
// Another route to update the profile on the page, happens during the select menu event when profile is selected. It then sends message to 'set' topic through MQTT
app.get('/selectedProfile', (req, res) => {
  const selectedProfileQuery = 'SELECT * FROM profile WHERE selected = ?'

  db.get(selectedProfileQuery, [true], (err, selectedProfile) => {
    if (err) {
      res.status(500).json({ error: err.message })
      return
    }
    console.log(selectedProfile)
    if (!selectedProfile) {
      res.json({}); // Return an empty object if no selected profile is found
      return
    }
    const message = JSON.stringify({
      mode: selectedProfile.auto, // Auto mode
      moisture: selectedProfile.target_moisture, // Target moisture
      water: selectedProfile.amount_of_water // Water amount
    })
    console.log(message)

    // Publish the message to the 'set' topic
    client.publish('set', message, function(err) {
      if (err) {
        console.error('Error publishing message:', err)
      } else {
        console.log(`Message published to 'set' topic for ${selectedProfile.name}`)
      }
    })
    res.json(selectedProfile) // Return the selected profile
  })
})

// Listen to serer
server.listen(3000, () => {
  console.log('Server OK port 3000')
})