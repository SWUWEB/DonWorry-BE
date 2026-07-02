import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';

const brand = {
  main: '#2F7F82',
  textPrimary: '#243130',
  textSecondary: '#6B7280',
};

const isSmtpConfigured = () => {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
};

const createVerificationCodeCells = (code) => {
  return code
    .split('')
    .map(
      (digit) =>
        `<td style="width:16.66%;text-align:center;font-size:40px;line-height:1;font-weight:700;color:${brand.main};white-space:nowrap;">${digit}</td>`,
    )
    .join('');
};

const formatTtlDuration = (codeTtlSeconds) => {
  const minutes = Math.floor(codeTtlSeconds / 60);
  const seconds = codeTtlSeconds % 60;

  if (minutes > 0 && seconds > 0) {
    return `${minutes}분 ${seconds}초`;
  }

  if (minutes > 0) {
    return `${minutes}분`;
  }

  return `${seconds}초`;
};

const createEmailVerificationHtml = ({ code, codeTtlSeconds }) => {
  const codeCells = createVerificationCodeCells(code);
  const expiresIn = formatTtlDuration(codeTtlSeconds);

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>이메일 인증 코드</title>
  </head>
  <body style="margin:0;padding:0;background:#f5f6f6;font-family:Pretendard,Arial,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:${brand.textPrimary};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f6;padding:44px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:38px 40px 28px;text-align:center;">
                <div style="font-size:22px;line-height:28px;font-weight:700;letter-spacing:0;color:${brand.main};">DonWorry</div>
                <div style="height:1px;background:#e8ecec;margin:28px 0 54px;"></div>
                <h1 style="margin:0;font-size:22px;line-height:28px;font-weight:700;letter-spacing:0;color:${brand.textPrimary};">이메일 인증 코드</h1>
                <p style="margin:18px auto 44px;max-width:360px;font-size:14px;line-height:22px;font-weight:500;letter-spacing:0;color:${brand.textSecondary};word-break:keep-all;">회원가입을 완료하려면 아래 인증 코드를 입력해주세요.</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:320px;margin:0 auto;table-layout:fixed;">
                  <tr>${codeCells}</tr>
                </table>
                <p style="margin:38px 0 0;font-size:14px;line-height:22px;font-weight:500;letter-spacing:0;color:${brand.textSecondary};">이 코드는 <strong style="font-weight:600;color:${brand.textPrimary};">${expiresIn}</strong> 뒤에 만료됩니다.</p>
                <div style="height:1px;background:#e8ecec;margin:54px 0 28px;"></div>
                <p style="margin:0 auto 8px;max-width:420px;font-size:12px;line-height:16px;font-weight:500;letter-spacing:0;color:${brand.textSecondary};word-break:keep-all;">본 메일은 발신 전용이며, 서비스 회원가입을 위한 이메일 인증을 위하여 발송하였습니다.</p>
                <p style="margin:0 auto 28px;max-width:420px;font-size:12px;line-height:16px;font-weight:500;letter-spacing:0;color:${brand.textSecondary};word-break:keep-all;">직접 요청하신 경우가 아니라면, 이 메일을 무시하셔도 됩니다.</p>
                <p style="margin:0 0 26px;font-size:12px;line-height:16px;font-weight:500;letter-spacing:0;color:${brand.textPrimary};">홈페이지&nbsp;&nbsp;|&nbsp;&nbsp;개인정보 처리방침&nbsp;&nbsp;|&nbsp;&nbsp;서비스 이용약관</p>
                <p style="margin:0;font-size:10px;line-height:14px;font-weight:400;letter-spacing:0;color:#a9b1b0;">@ 2026 DonWorry. All rights reserved.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};

export const sendEmailVerificationCode = async ({ email, code, codeTtlSeconds }) => {
  if (env.NODE_ENV === 'test') {
    return;
  }

  if (!isSmtpConfigured()) {
    if (env.NODE_ENV === 'production') {
      throw new Error('SMTP configuration is required to send email verification code.');
    }

    return;
  }

  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: env.SMTP_FROM || env.SMTP_USER,
    to: email,
    subject: `이메일 인증 코드: ${code}`,
    text: [
      'DonWorry',
      '이메일 인증 코드',
      '회원가입을 완료하려면 아래 인증 코드를 입력해주세요.',
      code,
      `이 코드는 ${formatTtlDuration(codeTtlSeconds)} 뒤에 만료됩니다.`,
      '본 메일은 발신 전용이며, 서비스 회원가입을 위한 이메일 인증을 위하여 발송하였습니다.',
      '직접 요청하신 경우가 아니라면, 이 메일을 무시하셔도 됩니다.',
      '홈페이지 | 개인정보 처리방침 | 서비스 이용약관',
      '@ 2026 DonWorry. All rights reserved.',
    ].join('\n'),
    html: createEmailVerificationHtml({ code, codeTtlSeconds }),
  });
};
