export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const formData = await request.formData();
    const name = formData.get("name");
    const email = formData.get("email"); // 用户填写的邮箱
    const message = formData.get("message");

    if (!name || !email || !message) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // ----------------------------------------------------
    // 邮件 1: 发送给管理员 (通知邮件)
    // ----------------------------------------------------
    const sendToAdmin = fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // 发件人：必须是您的域名
        from: "MOTA Website System <website@motaiot.com>", 
        // 收件人：您的 Google Workspace 邮箱
        to: ["contact@motaiot.com"], 
        // 关键：设置 Reply-To 为用户的邮箱，方便您直接回复
        reply_to: email, 
        subject: `[New Inquiry] Message from ${name}`,
        html: `
          <h3>New Contact Form Submission</h3>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Message:</strong></p>
          <blockquote style="background: #f9f9f9; padding: 10px; border-left: 3px solid #ccc;">
            ${message}
          </blockquote>
        `,
      }),
    });

    // ----------------------------------------------------
    // 邮件 2: 发送给用户 (自动回复/确认邮件)
    // ----------------------------------------------------
    const sendToUser = fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // 发件人：展示给用户看，显得专业
        from: "MOTA TECHLINK Support <contact@motaiot.com>", 
        // 收件人：用户填写的邮箱
        to: [email], 
        subject: `We've received your message, ${name}`,
        html: `
          <div style="font-family: sans-serif; color: #333;">
            <h2>Thank you for contacting MOTA TECHLINK!</h2>
            <p>Hi ${name},</p>
            <p>This is an automated message to confirm that we have received your inquiry.</p>
            <p>Our team will review your message and get back to you within 24 hours.</p>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="font-size: 12px; color: #666;">
              <strong>Your Message:</strong><br>
              ${message}
            </p>
            <p style="margin-top: 30px;">
              Best regards,<br>
              <strong>The MOTA TECHLINK Team</strong><br>
              <a href="https://motaiot.com">www.motaiot.com</a>
            </p>
          </div>
        `,
      }),
    });

    // 并行发送两封邮件，提高效率
    const [adminRes, userRes] = await Promise.all([sendToAdmin, sendToUser]);

    // 只要发给管理员的成功了，就算提交成功
    if (!adminRes.ok) {
      const errorData = await adminRes.json();
      throw new Error(errorData.message || "Failed to send notification email");
    }
    
    // (可选) 检查发给用户的邮件是否成功，通常不需要抛出错误阻断流程

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500, 
      headers: { "Content-Type": "application/json" }
    });
  }
}