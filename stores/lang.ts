import { defineStore } from 'pinia'

export const useLangStore = defineStore('lang', {
  state: () => ({
    preferredLanguage: ''
  }),
  actions: {
    initLanguage() {
      if (process.client) {
        const savedLang = localStorage.getItem('preferredLanguage')

        if (savedLang) {
          this.preferredLanguage = savedLang
        } else {
          const browserLang = navigator.language || 'en-US'
          this.preferredLanguage = browserLang
          localStorage.setItem('preferredLanguage', browserLang)
        }
      }
    },
    setLanguage(lang: string) {
      this.preferredLanguage = lang

      if (process.client) {
        localStorage.setItem('preferredLanguage', lang)
      }
    }
  }
})
