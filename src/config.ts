interface AppConfig {
  appName: string
  appDescription: string
  links: {
    twitter: string
    github: string
    telegram: string
    discord: string
    docs: string
    buy: string
  }
  contracts: {
    main: string
    token: string
  }
  features: {
    darkMode: boolean
    smoothScroll: boolean
  }
}

export const config: AppConfig = {
  appName: 'Jemari',
  appDescription: 'A simple interactive hand gesture recognition using MediaPipe.',

  // Social links
  links: {
    twitter: '',
    github: '',
    telegram: '',
    discord: '',
    docs: '',
    buy: '',
  },

  // Contract/wallet related (if needed)
  contracts: {
    main: '',
    token: '',
  },

  // Feature flags
  features: {
    darkMode: true,
    smoothScroll: true,
  },
}

export type Config = AppConfig
