const express = require('express')
const app = express()
const cors = require('cors')
const credentials = require('../db_credentials');
const morgan = require('morgan')
const mysql = require('mysql2')
const axios = require('axios')
const nodemailer = require('nodemailer')
const setTerminalTitle = require('set-terminal-title');
setTerminalTitle('Pay Service', { verbose: true });
var portfinder = require('portfinder');
portfinder.setBasePort(3250);
portfinder.setHighestPort(3299);
const HOST = 'localhost' // Change to actual host
var PORT;
const DB_NAME = 'sistemainstitucional'
const DB_USER = credentials['DB_USER']
const DB_PASSWORD = credentials['DB_PASSWORD']

app.use(express.json())
app.use(cors())
app.use(morgan('dev'))

// Create a connection to the mysql database
const connection = mysql.createConnection({
    host: HOST,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME
})

// Test database connection
connection.connect(error => {
    if (error) throw error
    console.log('Database connection running!')
})

// Make a transaction
app.post('/service', async (req, res) => {
    const body = req.body
    const { personalData, paymentMethod, service } = body
    if (paymentMethod.tarjeta) {
        const numero_tarjeta = paymentMethod.numero
        const numero_cuenta = 1111111111111111
        const monto = service.price
        const fecha_vencimiento = paymentMethod.fecha
        if (new Date(fecha_vencimiento) > Date.now()) {
            axios.post('http://localhost:5000/transaccion-tarjeta', {
                numero_tarjeta,
                numero_cuenta,
                monto
            }).then(response => {

                console.log(`Fecha vencimiento: ${Date(fecha_vencimiento)}`);
                console.log(response.data)
                if (response.data === 'Transaccion exitosa') {
                    res.send('Transaccion exitosa')
                    // registrar en el historial
                    const date = new Date()
                    const fecha = date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + date.getDate()
                    const hora = date.getHours() + ':' + date.getMinutes() + ':' + date.getSeconds()
                    const query = `INSERT INTO historial (fecha, hora, servicio, precio, metodo_pago, cuotas, id_persona) VALUES ('${fecha}', '${hora}', '${service.title}', ${service.price}, '${paymentMethod.proveedor + " *" + (paymentMethod.numero + "").substring(12, 16)}', ${paymentMethod.cuotas}, ${personalData.id})`
                    connection.query(query, (error, result) => {
                        if (error) throw error
                        // enviar correo
                        sendEmail(`Se ha realizado una transaccion exitosa de ${service.price} a traves de ${paymentMethod.proveedor} con el numero de tarjeta ${paymentMethod.numero} y ${paymentMethod.cuotas} cuotas`, personalData.email)
                    })
                } else {
                    res.status(400).send('Transaccion fallida')
                    // enviar correo con la info del response
                    sendEmail('La transaccion ha fallado, error: ' + response.data, personalData.email)
                }
            }).catch(error => {
                console.log(error)
                // enviar correo
                sendEmail('La transaccion ha fallado', personalData.email)
            })
        } else {
            res.status(400).send(`Tarjeta vencida`)
            // enviar correo
            sendEmail('La transaccion ha fallado, error: Tarjeta vencida', personalData.email)
        }
    } else if (paymentMethod.cuenta) {
        const numero_cuenta_origen = paymentMethod.numero
        const numero_cuenta_destino = 1111111111111111
        const monto = service.price
        axios.post('http://localhost:5000/transaccion-cuenta', {
            numero_cuenta_origen,
            numero_cuenta_destino,
            monto
        }).then(response => {
            console.log(response.data)
            if (response.data === 'Transaccion exitosa') {
                res.send('Transaccion exitosa')
                // registrar en el historial
                const date = new Date()
                const fecha = date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + date.getDate()
                const hora = date.getHours() + ':' + date.getMinutes() + ':' + date.getSeconds()
                const query = `INSERT INTO historial (fecha, hora, servicio, precio, metodo_pago, id_persona) VALUES ('${fecha}', '${hora}', '${service.title}', ${service.price}, '${paymentMethod.banco + " " + (paymentMethod.numero + "")}', ${personalData.id})`
                connection.query(query, (error, result) => {
                    if (error) throw error
                    // enviar correo
                    sendEmail(`Se ha realizado una transaccion exitosa de ${service.price} a traves de ${paymentMethod.banco} con el numero de cuenta ${paymentMethod.numero}.`, personalData.email)
                })
            } else if (response.data === 'Transacciones deshabilitadas') {
                return res.status(503).json({ message: 'Transacciones deshabilitadas por parte del banco', service: 'Transacciones bancarias' })
            } else {
                res.status(400).send('Transaccion fallida')
                // enviar correo con la info del response
                sendEmail('La transaccion ha fallado, error: ' + response.data, personalData.email)
            }
        }).catch(error => {
            console.log(error)
            // enviar correo
            sendEmail('La transaccion ha fallado', personalData.email)
        })
    } else {
        res.status(400).send('Invalid payment method')
        // enviar correo
        sendEmail('La transaccion ha fallado, error: Los campos ingresados estaban errados', personalData.email)
    }
})

async function sendEmail(message, email) {
    let mailTransporter = nodemailer.createTransport({
        service: "hotmail",
        auth: {
            user: "edupayr@outlook.com",
            pass: "12345qw."
        }
    });

    let mailDetails = {
        from: 'edupayr@outlook.com',
        to: `camilosinning.cs@gmail.com, ${email}`,
        subject: 'EduPay - Transaccion',
        text: message
    };

    mailTransporter.sendMail(mailDetails, function (err, data) {
        if (err) {
            console.log('Error Occurs');
            console.log(err);
        } else {
            console.log('Email sent successfully');
        }
    });
}


portfinder.getPort(function (err, port) {
    PORT = port
    app.listen(PORT, async () => {
        const response = await axios({
            method: 'post',
            url: `http://localhost:3000/register`,
            headers: { 'Content-Type': 'application/json' },
            data: {
                apiName: "pay",
                protocol: "http",
                host: HOST,
                port: PORT,
            }
        })
        await axios.post('http://localhost:3000/switch/pay', {
            "url": "http://localhost:" + PORT,
            "enabled": true
        })
        console.log(response.data)
        console.log(`Pay server listening on port ${PORT}`)
    })
})
