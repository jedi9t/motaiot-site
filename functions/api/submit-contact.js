// functions/submit-contact.js

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const formData = await request.formData();
    const name = formData.get("name");
    const email = formData.get("email"); // 访客填写的邮箱
    const message = formData.get("message");

    // 简单验证
    if (!name || !email || !message) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { 
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 调用 Resend API 发送邮件
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // 关键点：From 必须是您在 Resend 验证过的域名地址，例如 system@motaiot.com
        // 即使该邮箱在 Google Workspace 中不存在也没关系，只要 DNS 验证过即可。
        from: "MOTA TECHLINK Contact <website@motaiot.com>", 
        
        // To 发送到您真正的 Google Workspace 邮箱
        to: ["contact@motaiot.com"], // 替换为您新注册的 Google 邮箱
        
        // Reply-To 设置为访客邮箱，这样您在 Gmail 点击回复时，直接回复给客户
        reply_to: email, 
        
        subject: `New Inquiry from ${name}`,
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

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || "Failed to send email");
    }

    // 成功后，您可以选择重定向到一个感谢页面，或者返回 JSON 让前端处理
    // 这里示例返回 JSON
    return new Response(JSON.stringify({ success: true, id: data.id }), {
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