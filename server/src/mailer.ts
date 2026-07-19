import nodemailer from 'nodemailer'

// Points at Mailpit locally (docker-compose, port 1025 — no auth needed).
// Swap host/port/auth for Resend's SMTP or API once deploying for real.
export const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'localhost',
    port: Number(process.env.SMTP_PORT ?? 1025),
    secure: false,
})

export async function sendOtpEmail(email: string, code: string) {
    await transporter.sendMail({
        from: 'Certificate Portfolio <no-reply@portfolio.local>',
        to: email,
        subject: 'Your sign-in code',
        text: `Your sign-in code is ${code}. It expires in 5 minutes.`,
        html: `<p>Your sign-in code is <strong>${code}</strong>. It expires in 5 minutes.</p>`,
    })
}