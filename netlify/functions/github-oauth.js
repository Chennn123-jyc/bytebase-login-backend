// netlify/functions/github-oauth.js
const https = require('https');

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsedData = JSON.parse(data);
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            json: () => Promise.resolve(parsedData)
          });
        } catch (error) {
          reject(new Error(`JSON 解析错误: ${error.message}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    if (postData) {
      req.write(postData);
    }
    
    req.end();
  });
}

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
      headers: { 'Access-Control-Allow-Origin': '*' },
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

    // 检查环境变量
    if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
      throw new Error('GitHub OAuth 环境变量未设置');
    }

    console.log('Client ID:', process.env.GITHUB_CLIENT_ID ? '已设置' : '未设置');
    console.log('Client Secret:', process.env.GITHUB_CLIENT_SECRET ? '已设置' : '未设置');

    // 获取访问令牌
    const tokenData = {
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code: code
    };

    const tokenResponse = await makeRequest(
      {
        hostname: 'github.com',
        path: '/login/oauth/access_token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Netlify-Function'
        }
      },
      JSON.stringify(tokenData)
    );

    console.log('GitHub 令牌响应状态:', tokenResponse.status);

    if (!tokenResponse.ok) {
      throw new Error(`GitHub 令牌请求失败: ${tokenResponse.status}`);
    }

    const tokenResult = await tokenResponse.json();

    if (tokenResult.error) {
      throw new Error(`GitHub OAuth 错误: ${tokenResult.error_description || tokenResult.error}`);
    }

    const accessToken = tokenResult.access_token;

    if (!accessToken) {
      throw new Error('未收到访问令牌');
    }

    // 获取用户信息
    const userResponse = await makeRequest({
      hostname: 'api.github.com',
      path: '/user',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'User-Agent': 'Netlify-Function'
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
        const emailsResponse = await makeRequest({
          hostname: 'api.github.com',
          path: '/user/emails',
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
            'User-Agent': 'Netlify-Function'
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