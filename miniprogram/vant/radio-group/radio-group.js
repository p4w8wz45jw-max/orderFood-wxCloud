Component({
  externalClasses: ['custom-class'],
  properties: {
    value: {
      type: null,
      value: null
    },
    direction: {
      type: String,
      value: 'vertical'
    }
  },
  methods: {
    onChange(event) {
      this.triggerEvent('change', event.detail)
    }
  }
})