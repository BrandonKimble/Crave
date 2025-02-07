interface Config {
  reddit: {
    clientId: string;
    clientSecret: string;
    userAgent: string;
  }
  logging: {
    level: string;
  }
}

const config: Config = {
  reddit: {
    clientId: process.env.REDDIT_CLIENT_ID || '',
    clientSecret: process.env.REDDIT_CLIENT_SECRET || '',
    userAgent: 'CraveSearch/1.0.0',
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  }
};

export default config;