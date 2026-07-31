import express from 'express'
import nodemailer from 'nodemailer'
import { kv } from '@vercel/kv'
import crypto from 'crypto'

if (process.env.NODE_ENV !== 'production') {
	const dotenv = await import('dotenv')
	dotenv.config()
}

const app = express()
app.use(express.json())

const transporter = nodemailer.createTransport({
	service: 'gmail',
	auth: {
		user: process.env.EMAIL_USER,
		pass: process.env.EMAIL_PASS
	}
})

app.get('/', async (req, res) => {
	return res.status(200).json({
		success: true,
		message: 'So long partner.'
	})
})

app.post('/api/send', async (req, res) => {
	const { email, title, digits, auth } = req.body
	let digit_count = digits

	if (!auth || auth != process.env.AUTHORIZATION_KEY) return res.status(401).json({ error: 'Unauthorized.' })
	if (!email) return res.status(400).json({ error: 'Missing email address.' })
	if (!title) return res.status(400).json({ error: 'Missing project title.' })
	if (!digits || digits <= 1) digit_count = 6

	try {
		const otp = crypto.randomInt(10 ** (digit_count - 1), 10 ** digit_count).toString()
		const uuid = crypto.randomUUID()
		await kv.set(`otp:${uuid}`, JSON.stringify({ otp, email, title }), { ex: 300 })
		await transporter.sendMail({
			from: `"${title}" <${process.env.GMAIL_USER}>`,
			to: email,
			subject: 'Your Verification Code',
			text: `Your security OTP is: ${otp}. This will expire in 5 minutes.`,
			html: `<p>Your security OTP is: <strong>${otp}</strong>.</p><p>Valid for 5 minutes.</p>`
		})
		return res.status(200).json({
			success: true,
			message: 'OTP generated and sent successfully.',
			uuid: uuid
		})
	} catch (error) {
		console.error('POST /api/send failed:', error)
		return res.status(500).json({ success: false, error: error.message })
	}
})

app.post('/api/sms', async (req, res) => {
	const { phone, title, digits, auth } = req.body
	let digit_count = digits

	if (!auth || auth != process.env.AUTHORIZATION_KEY) return res.status(401).json({ error: 'Unauthorized.' })
	if (!phone) return res.status(400).json({ error: 'Missing phone number.' })
	if (!title) return res.status(400).json({ error: 'Missing project title.' })
	if (!digits || digits <= 1) digit_count = 6

	try {
		const otp = crypto.randomInt(10 ** (digit_count - 1), 10 ** digit_count).toString()
		const uuid = crypto.randomUUID()
		await kv.set(`otp:${uuid}`, JSON.stringify({ otp, phone, title }), { ex: 300 })

		const smsres = await fetch(
			`https://api.textbee.dev/api/v1/gateway/devices/${process.env.TEXTBEE_DEVICE_ID}/send-sms`,
			{
				method: 'POST',
				headers: { 'x-api-key': process.env.TEXTBEE_API_KEY, 'Content-Type': 'application/json' },
				body: JSON.stringify({
					recipients: [phone],
					message: `Your security OTP is: ${otp}. This will expire in 5 minutes. - ${title}`
				})
			}
		)

		if (!smsres.ok) {
			const smserr = await smsres.json().catch(() => ({}))
			throw new Error(smserr.error || `HTTP ${smsres.status}`)
		} else {
			return res.status(200).json({
				success: true,
				message: 'OTP generated and sent successfully.',
				uuid: uuid
			})
		}
	} catch (error) {
		console.error('POST /api/sms failed:', error)
		return res.status(500).json({ success: false, error: error.message })
	}
})

app.get('/api/verify', async (req, res) => {
	const { uuid, auth } = req.query

	if (!auth || auth != process.env.AUTHORIZATION_KEY) return res.status(401).json({ error: 'Unauthorized.' })
	if (!uuid) return res.status(400).json({ error: 'Missing uuid query parameter.' })

	try {
		const key = `otp:${uuid}`
		const record = await kv.get(key)

		if (!record) return res.status(404).json({ success: false, error: 'OTP expired or invalid UUID.' })
		await kv.del(key)

		if (record.email) {
			await transporter.sendMail({
				from: `"${record.title}" <${process.env.GMAIL_USER}>`,
				to: record.email,
				subject: 'Welcome home',
				text: `Your account is now verified.`,
				html: `<p>Your account is now <strong>verified</strong>.</p>`
			})
		}

		return res.status(200).json({
			success: true,
			data: {
				email: record.email,
				phone: record.phone,
				otp: record.otp,
				title: record.title
			}
		})
	} catch (error) {
		console.error('GET /api/verify failed:', error)
		return res.status(500).json({ success: false, error: error.message })
	}
})

export default app

if (process.env.NODE_ENV !== 'production') {
	const PORT = process.env.PORT || 3000
	app.listen(PORT, () => {
		console.log(`🚀 Local test server running at http://localhost:${PORT}`)
	})
}
