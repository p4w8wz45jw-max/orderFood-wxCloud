const STORAGE_KEY = 'user_addresses'

function getAddresses() {
  const addresses = wx.getStorageSync(STORAGE_KEY) || []
  return addresses.sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0))
}

function saveAddresses(addresses) {
  wx.setStorageSync(STORAGE_KEY, addresses)
}

function addAddress(address) {
  const addresses = getAddresses()
  const newAddress = {
    _id: Date.now().toString(),
    ...address,
    createTime: new Date().toISOString()
  }
  if (newAddress.isDefault) {
    addresses.forEach(addr => addr.isDefault = false)
  }
  addresses.push(newAddress)
  saveAddresses(addresses)
  return newAddress
}

function updateAddress(id, updatedData) {
  let addresses = getAddresses()
  const index = addresses.findIndex(addr => addr._id === id)
  if (index !== -1) {
    if (updatedData.isDefault) {
      addresses.forEach(addr => addr.isDefault = false)
    }
    addresses[index] = { ...addresses[index], ...updatedData }
    saveAddresses(addresses)
    return true
  }
  return false
}

function deleteAddress(id) {
  const addresses = getAddresses()
  saveAddresses(addresses.filter(addr => addr._id !== id))
}

function setDefault(id) {
  let addresses = getAddresses()
  addresses.forEach(addr => addr.isDefault = (addr._id === id))
  saveAddresses(addresses)
}

module.exports = {
  getAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
  setDefault
}