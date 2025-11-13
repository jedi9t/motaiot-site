// functions/api/auth/[...auth].js

// import { Auth } from "@auth/core";
import NextAuth from "next-auth"
import { D1Adapter } from "@auth/d1-adapter";


// 从 next-auth 主包的内部路径导入 Providers (最稳定的导入方式)
//GOOGLE: https://authjs.dev/getting-started/providers/google
import Google from "next-auth/providers/google"; 
import Discord from "next-auth/providers/discord";
import LinkedIn from "next-auth/providers/linkedin"; 
import Reddit from "next-auth/providers/reddit";
import Twitter from "next-auth/providers/twitter"; 

// 定义 Auth.js 的配置选项
const authOptions = (env) => ({
  // D1 适配器配置：使用 Pages Functions 注入的 env.DB 绑定
  adapter: D1Adapter(env.hugo_auth_db), 
  
  // 启用 JWT 会话策略，适用于无状态环境
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  
  // 配置 Providers
  providers: [
    Google({ clientId: env.GOOGLE_ID, clientSecret: env.GOOGLE_SECRET }),
    Discord({ clientId: env.DISCORD_ID, clientSecret: env.DISCORD_SECRET }),
    LinkedIn({ clientId: env.LINKEDIN_ID, clientSecret: env.LINKEDIN_SECRET }),
    Reddit({ clientId: env.REDDIT_ID, clientSecret: env.REDDIT_SECRET }),
    Twitter({ clientId: env.TWITTER_ID, clientSecret: env.TWITTER_SECRET }),
  ],

  secret: env.AUTH_SECRET,
  basePath: "/api/auth",
  
  // 回调函数：将用户ID添加到 JWT 和 Session 中
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id; 
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id; 
      return session;
    },
  },
});

// Cloudflare Pages Functions 的入口点
export async function onRequest(context) {
  // context.env 包含了所有的环境变量和 D1 绑定
  return NextAuth(context.request, authOptions(context.env));
}