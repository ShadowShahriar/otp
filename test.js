import readline from 'readline'

// Base URL of your local Express server
const BASE_URL = 'http://localhost:3000'

// Change this to your test recipient email
const TEST_EMAIL = 'testmail1234@gmail.com'

// Change this to your test recipient phone number
// const TEST_PHONE = '+8801XXXXXXXXX'

const TEST_TITLE = 'Verification'
const OTP_LENGTH = 5

const askQuestion = query => {
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
	return new Promise(resolve =>
		rl.question(query, ans => {
			rl.close()
			resolve(ans)
		})
	)
}

const test = async () => {
	try {
		let res
		console.log(`🟦 Requesting OTP: ${TEST_PHONE || TEST_EMAIL}`)

		if (TEST_PHONE) {
			res = await fetch(`${BASE_URL}/api/sms`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ phone: TEST_PHONE, title: TEST_TITLE, digits: OTP_LENGTH })
			})
		} else {
			res = await fetch(`${BASE_URL}/api/send`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: TEST_EMAIL, title: TEST_TITLE, digits: OTP_LENGTH })
			})
		}

		const data = await res.json()
		console.log(data)
		if (!res.ok) throw new Error(`Send failed: ${data.error || res.statusText}`)

		const { uuid } = data
		console.log(`✅ Success! Tracking UUID: ${uuid}`)
		console.log('🟧 Check inbox (or spam) for the code.\n')

		const otp = await askQuestion('🟨 Enter the OTP you received: ')
		console.log('🟦 Verifying')

		const vres = await fetch(`${BASE_URL}/api/verify?uuid=${uuid}`, { method: 'GET' })

		const vdata = await vres.json()
		console.log(vdata)
		if (!vres.ok) throw new Error(`Verification fetching failed: ${vdata.error || vres.statusText}`)

		const obtainedOtp = vdata.data.otp
		const obtainedEmail = vdata.data.email
		const obtainedPhone = vdata.data.phone

		if (otp.trim() === obtainedOtp) console.log('✅ VALIDATION SUCCESSFUL: OTP matched.')
		else console.log('\n⛔ VALIDATION FAILED: OTP mismatch.')

		console.log('\n🟦 Checking whether the single-use OTP was deleted')
		const rres = await fetch(`${BASE_URL}/api/verify?uuid=${uuid}`)
		const rdata = await rres.json()

		if (rres.status === 404)
			console.log('✅ Security Check Passed: The tracking key was destroyed after first read.')
		else console.log('⛔ Security Warning: Key still persists in the database!', rdata)
	} catch (error) {
		console.error('⛔ Error:', error.message)
	}
}

test()
