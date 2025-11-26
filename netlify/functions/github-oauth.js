
const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  // 处理 CORS 预检请求
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    const { code } = JSON.parse(event.body);

    if (!code) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: '缺少授权码' })
      };
    }

    console.log('处理 GitHub OAuth 回调，授权码:', code);

    // 获取访问令牌
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code: code
      })
    });

    if (!tokenResponse.ok) {
      throw new Error(`GitHub 令牌请求失败: ${tokenResponse.status}`);
    }

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      throw new Error(`GitHub OAuth 错误: ${tokenData.error_description || tokenData.error}`);
    }

    const accessToken = tokenData.access_token;

    if (!accessToken) {
      throw new Error('未收到访问令牌');
    }

    // 获取用户信息
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    if (!userResponse.ok) {
      throw new Error(`获取用户信息失败: ${userResponse.status}`);
    }

    const userData = await userResponse.json();

    // 获取用户邮箱
    let email = userData.email;
    if (!email) {
      try {
        const emailsResponse = await fetch('https://api.github.com/user/emails', {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        });
        
        if (emailsResponse.ok) {
          const emails = await emailsResponse.json();
          const primaryEmail = emails.find(email => email.primary);
          email = primaryEmail ? primaryEmail.email : (emails[0]?.email || '未提供邮箱');
        }
      } catch (emailError) {
        console.warn('获取邮箱失败:', emailError);
        email = '未提供邮箱';
      }
    }

    const userInfo = {
      id: userData.id,
      login: userData.login,
      name: userData.name || userData.login,
      email: email,
      avatar_url: userData.avatar_url,
      html_url: userData.html_url
    };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(userInfo)
    };

  } catch (error) {
    console.error('OAuth 处理错误:', error);

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        error: 'GitHub OAuth 处理失败',
        details: error.message 
      })
    };
  }
};