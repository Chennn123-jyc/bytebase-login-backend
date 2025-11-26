
exports.handler = async function(event, context) {
    // 检查环境变量是否存在
    const envVars = {
      GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
      GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET ? '***设置成功***' : '未设置',
      NODE_ENV: process.env.NODE_ENV
    };
    
    console.log('环境变量检查:', envVars);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(envVars)
    };
  };