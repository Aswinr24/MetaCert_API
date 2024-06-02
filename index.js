require('dotenv').config()

const express = require('express')
const path = require('path')
const axios = require('axios')
const fs = require('fs')
const multer = require('multer')
const FormData = require('form-data')
const ejsmate = require('ejs-mate')
const methodoverride = require('method-override')
const cors = require('cors')

const app = express()
app.use(cors())
const port = 8080

const JWT = process.env.JWT_TOKEN

// Set up EJS as the templating engine
app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, '/views'))
app.engine('ejs', ejsmate)

// Middleware setup
app.use(express.static(path.join(__dirname, '/public')))
app.use(express.urlencoded({ extended: true }))
app.use(express.json())
app.use(methodoverride('_method'))

// Ensure the uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads')
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir)
}

const upload = multer({ dest: uploadsDir })

app.get('/', (req, res) => {
  res.render('index.ejs')
})

app.post('/upload', upload.single('file'), async (req, res) => {
  const file = req.file

  if (!file) {
    return res.status(400).json({ error: 'No file uploaded' })
  }

  const filePath = file.path

  try {
    const formData = new FormData()
    formData.append('file', fs.createReadStream(filePath))

    const pinataMetadata = JSON.stringify({
      name: file.originalname, // Use original file name as metadata
    })
    formData.append('pinataMetadata', pinataMetadata)

    const pinataOptions = JSON.stringify({
      cidVersion: 1, // Use CID version 1
    })
    formData.append('pinataOptions', pinataOptions)

    const pinataResponse = await axios.post(
      'https://api.pinata.cloud/pinning/pinFileToIPFS',
      formData,
      {
        maxContentLength: Infinity, // Set maxContentLength instead of maxBodyLength
        headers: {
          Authorization: `Bearer ${JWT}`, // Use JWT for authorization
          ...formData.getHeaders(),
        },
      }
    )

    // Construct IPFS gateway link
    const ipfsHash = pinataResponse.data.IpfsHash
    console.log(pinataResponse)
    const pinataLink = `ipfs://${ipfsHash}`

    // Clean up the uploaded file
    fs.unlinkSync(filePath)

    // Create a JSON file with the specified format
    const jsonContent = JSON.stringify({
      name: req.body.sname + "'s " + req.body.title,
      description: req.body.desc,
      image: pinataLink,
    })
    const jsonFilePath = path.join(uploadsDir, `${req.body.sname}.json`)
    fs.writeFileSync(jsonFilePath, jsonContent)

    // Upload the JSON file to Pinata
    const jsonFormData = new FormData()
    jsonFormData.append('file', fs.createReadStream(jsonFilePath))

    const jsonPinataMetadata = JSON.stringify({
      name: 'metadata.json', // JSON file metadata
    })
    jsonFormData.append('pinataMetadata', jsonPinataMetadata)

    const jsonPinataOptions = JSON.stringify({
      cidVersion: 1, // Use CID version 1
    })
    jsonFormData.append('pinataOptions', jsonPinataOptions)

    const jsonPinataResponse = await axios.post(
      'https://api.pinata.cloud/pinning/pinFileToIPFS',
      jsonFormData,
      {
        maxContentLength: Infinity, // Set maxContentLength instead of maxBodyLength
        headers: {
          Authorization: `Bearer ${JWT}`, // Use JWT for authorization
          ...jsonFormData.getHeaders(),
        },
      }
    )

    // Clean up the JSON file
    fs.unlinkSync(jsonFilePath)

    // Return the hash of the uploaded JSON file
    const jsonPinataLink = `https://gateway.pinata.cloud/ipfs/${jsonPinataResponse.data.IpfsHash}`
    res.json({ pinataLink, jsonPinataLink })
  } catch (error) {
    console.error('Error uploading to Pinata:', error)
    res.status(500).json({ error: 'Error uploading to Pinata' })
  }
})

app.listen(port, () => {
  console.log(`Server running on port ${port}`)
})
