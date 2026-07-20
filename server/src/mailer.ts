import nodemailer from 'nodemailer'

// Points at Mailpit locally (docker-compose, port 1025 — no auth needed).
// Swap host/port/auth for Resend's SMTP or API once deploying for real.
export const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'localhost',
    port: Number(process.env.SMTP_PORT ?? 1025),
    secure: false,
})

export async function sendOtpEmail(email: string, code: string) {
    const appName = "Docenti"
    const supportEmail = "suporte@utfpr.edu.br"

    await transporter.sendMail({
        from: `"${appName} - UTFPR" <no-reply@portfolio.local>`,
        to: email,
        subject: `${code} é o seu código de acesso no ${appName}`,
        text: `Seu código de acesso ao ${appName} é: ${code}. Ele expira em 5 minutos. Se você não solicitou este código, ignore este e-mail.`,
        html: `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Código de Acesso - ${appName}</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f4f5; padding: 40px 10px;">
            <tr>
                <td align="center">
                    <!-- Main Email Container -->
                    <table role="presentation" width="100%" style="max-width: 500px; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e4e4e7; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                        
                        <!-- Header with UTFPR Yellow Accent Bar -->
                        <tr>
                            <td style="background-color: #111111; padding: 24px; text-align: center; border-bottom: 4px solid #FFBE00;">
                                <!-- Replace src with your hosted public logo URL when deployed -->
                                <img src="https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/award.png" 
                                     alt="${appName} Logo" 
                                     width="40" 
                                     height="40" 
                                     style="vertical-align: middle; margin-right: 8px;" />
                                <span style="color: #ffffff; font-size: 20px; font-weight: 800; tracking-tight: -0.5px; vertical-align: middle;">
                                    ${appName}<span style="color: #FFBE00;">.</span>
                                </span>
                            </td>
                        </tr>

                        <!-- Body Content -->
                        <tr>
                            <td style="padding: 32px 24px; text-align: left;">
                                <h1 style="margin: 0 0 12px 0; color: #18181b; font-size: 20px; font-weight: 700;">
                                    Seu código de verificação
                                </h1>
                                <p style="margin: 0 0 24px 0; color: #52525b; font-size: 14px; line-height: 1.5;">
                                    Use o código de segurança abaixo para autenticar sua conta no portal <strong>${appName}</strong>.
                                </p>

                                <!-- OTP Code Box -->
                                <div style="background-color: #f4f4f5; border-radius: 8px; padding: 16px; text-align: center; margin-bottom: 24px; border: 1px dashed #d4d4d8;">
                                    <span style="font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #111111;">
                                        ${code}
                                    </span>
                                </div>

                                <p style="margin: 0 0 20px 0; color: #71717a; font-size: 13px; line-height: 1.4;">
                                    ⏱️ Este código expira em <strong>5 minutos</strong> e só pode ser utilizado uma vez.
                                </p>

                                <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 24px 0;" />

                                <!-- Safety / Disclaimer Text -->
                                <p style="margin: 0; color: #a1a1aa; font-size: 12px; line-height: 1.5;">
                                    <strong>Não solicitou este código?</strong> Você pode ignorar com segurança este e-mail. É possível que outro usuário tenha digitado o endereço incorretamente. Sua conta permanece segura.
                                </p>
                            </td>
                        </tr>

                        <!-- Footer -->
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
    })
}