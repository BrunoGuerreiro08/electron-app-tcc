import nodemailer from 'nodemailer'
import path from 'path'
import { fileURLToPath } from 'url'

// Recreate __dirname for ESM environments
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'localhost',
    port: Number(process.env.SMTP_PORT ?? 1025),
    secure: false,
})

type Language = 'pt' | 'en'

const translations = {
    pt: {
        subject: (code: string, appName: string) => `${code} é o seu código de acesso no ${appName}`,
        title: (appName: string) => `Código de Acesso - ${appName}`,
        header: 'Seu código de verificação',
        body: (appName: string) => `Use o código de segurança abaixo para autenticar sua conta no portal <strong>${appName}</strong>.`,
        expiration: '⏱️ Este código expira em <strong>5 minutos</strong> e só pode ser utilizado uma vez.',
        disclaimerHeader: 'Não solicitou este código?',
        disclaimerText: 'Você pode ignorar com segurança este e-mail. É possível que outro usuário tenha digitado o endereço incorretamente. Sua conta permanece segura.',
        textBody: (code: string, appName: string) => `Seu código de acesso ao ${appName} é: ${code}. Ele expira em 5 minutos. Se você não solicitou este código, ignore este e-mail.`
    },
    en: {
        subject: (code: string, appName: string) => `${code} is your access code for ${appName}`,
        title: (appName: string) => `Access Code - ${appName}`,
        header: 'Your verification code',
        body: (appName: string) => `Use the security code below to authenticate your account on the <strong>${appName}</strong> portal.`,
        expiration: '⏱️ This code expires in <strong>5 minutes</strong> and can only be used once.',
        disclaimerHeader: 'Didn\'t request this code?',
        disclaimerText: 'You can safely ignore this email. Another user may have entered your address by mistake. Your account remains secure.',
        textBody: (code: string, appName: string) => `Your access code for ${appName} is: ${code}. It expires in 5 minutes. If you did not request this code, please ignore this email.`
    }
}

export async function sendOtpEmail(email: string, code: string, lang: Language = 'pt') {
    const appName = "Docenti"
    const t = translations[lang] ?? translations.pt

    await transporter.sendMail({
        from: `"${appName} - UTFPR" <no-reply@portfolio.local>`,
        to: email,
        subject: t.subject(code, appName),
        text: t.textBody(code, appName),
        html: `
    <!DOCTYPE html>
    <html lang="${lang === 'pt' ? 'pt-BR' : 'en'}">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${t.title(appName)}</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f4f5; padding: 40px 10px;">
            <tr>
                <td align="center">
                    <table role="presentation" width="100%" style="max-width: 500px; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e4e4e7; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                        
                        <tr>
                            <td style="background-color: #111111; padding: 24px; text-align: center; border-bottom: 4px solid #FFBE00;">
                                <!-- References the CID attachment -->
                                <img src="cid:app-logo" 
                                     alt="${appName} Logo" 
                                     width="40" 
                                     height="40" 
                                     style="vertical-align: middle; margin-right: 8px;" />
                                <span style="color: #ffffff; font-size: 20px; font-weight: 800; vertical-align: middle;">
                                    ${appName}<span style="color: #FFBE00;">.</span>
                                </span>
                            </td>
                        </tr>

                        <tr>
                            <td style="padding: 32px 24px; text-align: left;">
                                <h1 style="margin: 0 0 12px 0; color: #18181b; font-size: 20px; font-weight: 700;">
                                    ${t.header}
                                </h1>
                                <p style="margin: 0 0 24px 0; color: #52525b; font-size: 14px; line-height: 1.5;">
                                    ${t.body(appName)}
                                </p>

                                <div style="background-color: #f4f4f5; border-radius: 8px; padding: 16px; text-align: center; margin-bottom: 24px; border: 1px dashed #d4d4d8;">
                                    <span style="font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #111111;">
                                        ${code}
                                    </span>
                                </div>

                                <p style="margin: 0 0 20px 0; color: #71717a; font-size: 13px; line-height: 1.4;">
                                    ${t.expiration}
                                </p>

                                <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 24px 0;" />

                                <p style="margin: 0; color: #a1a1aa; font-size: 12px; line-height: 1.5;">
                                    <strong>${t.disclaimerHeader}</strong> ${t.disclaimerText}
                                </p>
                            </td>
                        </tr>

                        <tr>
                            <td style="background-color: #fafafa; padding: 16px 24px; text-align: center; border-top: 1px solid #f4f4f5;">
                                <p style="margin: 0; color: #a1a1aa; font-size: 11px;">
                                    © ${new Date().getFullYear()} ${appName} — Universidade Tecnológica Federal do Paraná (UTFPR)
                                </p>
                            </td>
                        </tr>

                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    `,
        attachments: [
            {
                filename: 'logo.svg',
                path: path.join(__dirname, '../assets/logo.svg'),
                cid: 'app-logo'
            }
        ]
    })
}