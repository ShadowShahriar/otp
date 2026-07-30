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
		user: process.env.GMAIL_USER,
		pass: process.env.GMAIL_PASS
	}
})

app.get('/', async (req, res) => {
	return res.status(200).json({
		success: true,
		message: 'So long partner.'
	})
})

app.post('/api/send', async (req, res) => {
	const { email, title, digits } = req.body
	let digit_count = digits

	if (!email) return res.status(400).json({ error: 'Missing email address.' })
	if (!title) return res.status(400).json({ error: 'Missing project title.' })
	if (!digits || digits <= 1) digits = 6

	try {
		const otp = crypto.randomInt(10 ** digit_count, 10 ** (digit_count + 1)).toString()
		const uuid = crypto.randomUUID()
		await kv.set(`otp:${uuid}`, JSON.stringify({ otp, email }), { ex: 300 })
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

app.get('/api/verify', async (req, res) => {
	const { uuid } = req.query
	if (!uuid) return res.status(400).json({ error: 'Missing uuid query parameter.' })

	try {
		const key = `otp:${uuid}`
		const record = await kv.get(key)

		if (!record) return res.status(404).json({ success: false, error: 'OTP expired or invalid UUID.' })
		await kv.del(key)
		return res.status(200).json({
			success: true,
			data: {
				email: record.email,
				otp: record.otp
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
