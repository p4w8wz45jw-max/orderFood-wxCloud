// pages-sub/admin/dish/dish.js
const db = wx.cloud.database()
const app = getApp()

// 分类行高(rpx)，拖动排序位移换算用；需与 dish.wxss 中 .category-item 高度保持一致
const CATEGORY_ROW_RPX = 160

Page({
  data: {
    // 分类相关
    categories: [],
    currentCategoryId: '',
    showCategoryModal: false,
    editCategoryMode: false,
    currentCategory: {
      _id: '',
      name: '',
      sort: 0
    },

    // 分类拖动排序
    categoryStyles: [],   // 各分类行位移(px)，与 categories 一一对应
    dragIndex: -1,        // 当前拖动中的分类下标，-1=未拖动

    // 菜品相关
    dishes: [],
    showDishModal: false,
    editDishMode: false,
    currentDish: {
      _id: '',
      name: '',
      price: '',
      originalPrice: '',
      description: '',
      categoryId: '',
      categoryName: '',
      image: '',
      status: 1,
      sort: 0,
      noMemberDiscount: false,  // 不参与余额支付95折
      customDiscount: '',   // 全场自定义折扣：填支付比例（如90=按原价90%结算，顾客端显示9折）；留空/0 不设置
      tags: []
    },
    
    // 标签编辑
    showTagModal: false,
    editingTagIndex: -1,
    currentTag: {
      name: '',
      type: 'single',
      required: true,
      options: [],
      pickCount: 1
    },
    newOption: '',
    dishPage: 0,
    dishPageSize: 20,
    dishHasMore: true,
    loadingDishes: false
  },

  onLoad() {
    this.setThemeColor()
    this.initDragEnv()
    this.loadCategories()
    this.loadDishes()
  },

  onShow() {
    this.setThemeColor()
    this.loadCategories()
    this.loadDishes()
  },

  setThemeColor() {
    const themeColor = app.globalData.themeColor || '#e54d42'
    wx.setNavigationBarColor({
      frontColor: '#ffffff',
      backgroundColor: themeColor
    })
  },

  // 拖动排序准备：按窗口宽度把分类行高换算为 px，供位移计算使用
  initDragEnv() {
    try {
      const sys = wx.getSystemInfoSync()
      const px = Math.round(((sys.windowWidth || 375) / 750) * CATEGORY_ROW_RPX)
      this._categoryRowH = px > 0 ? px : 50
    } catch (err) {
      this._categoryRowH = 50
    }
  },

  async loadCategories() {
    try {
      const res = await wx.cloud.callFunction({ name: 'getCategory' })
      const result = res.result || {}
      const categories = result.success ? (result.data || []) : []
      const categoryStyles = categories.map(() => 0)

      if (categories.length > 0 && !this.data.currentCategoryId) {
        this.setData({
          categories: categories,
          categoryStyles: categoryStyles,
          dragIndex: -1,
          currentCategoryId: categories[0]._id
        }, () => { this.loadDishes() })
      } else {
        this.setData({ categories: categories, categoryStyles: categoryStyles, dragIndex: -1 }, () => {
          if (this.data.currentCategoryId) this.loadDishes()
        })
      }
    } catch (err) { console.error('加载分类失败', err) }
  },

  switchCategory(e) {
    const categoryId = e.currentTarget.dataset.id
    this.setData({ currentCategoryId: categoryId }, () => { this.loadDishes() })
  },

  showAddCategoryModal() {
    this.setData({
      showCategoryModal: true,
      editCategoryMode: false,
      currentCategory: { _id: '', name: '', sort: this.data.categories.length }
    })
  },

  showEditCategoryModal(e) {
    const category = e.currentTarget.dataset.category
    this.setData({
      showCategoryModal: true,
      editCategoryMode: true,
      currentCategory: { ...category }
    })
  },

  closeCategoryModal() { this.setData({ showCategoryModal: false }) },

  onCategoryNameInput(e) { this.setData({ 'currentCategory.name': e.detail.value }) },
  onCategorySortInput(e) { this.setData({ 'currentCategory.sort': parseInt(e.detail.value) || 0 }) },

  async saveCategory() {
    const { editCategoryMode, currentCategory } = this.data
    if (!currentCategory.name.trim()) {
      wx.showToast({ title: '请输入分类名称', icon: 'none' })
      return
    }
    try {
      wx.showLoading({ title: '保存中...' })
      if (editCategoryMode) {
        const { _id, _openid, ...updateData } = currentCategory
        await wx.cloud.callFunction({
          name: 'adminSaveData',
          data: { action: 'update', collection: 'dishCategory', docId: _id, data: updateData }
        })
      } else {
        const addRes = await wx.cloud.callFunction({
          name: 'adminSaveData',
          data: { action: 'add', collection: 'dishCategory', data: { name: currentCategory.name, sort: currentCategory.sort, createTime: new Date() } }
        })
        if (addRes.result && addRes.result.success) {
          this.setData({ currentCategoryId: addRes.result._id })
        }
      }
      wx.hideLoading()
      wx.showToast({ title: '保存成功', icon: 'success' })
      this.closeCategoryModal()
      this.loadCategories()
    } catch (err) {
      wx.hideLoading()
      console.error('保存失败', err)
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  deleteCategory(e) {
    const category = e.currentTarget.dataset.category
    wx.showModal({
      title: '确认删除',
      content: `确定要删除分类"${category.name}"吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '删除中...' })
            await wx.cloud.callFunction({
              name: 'adminSaveData',
              data: { action: 'remove', collection: 'dishCategory', docId: category._id }
            })
            wx.hideLoading()
            wx.showToast({ title: '删除成功', icon: 'success' })
            if (this.data.currentCategoryId === category._id) {
              this.setData({ currentCategoryId: '', dishes: [] })
            }
            this.loadCategories()
          } catch (err) {
            wx.hideLoading()
            console.error('删除失败', err)
            wx.showToast({ title: '删除失败', icon: 'none' })
          }
        }
      }
    })
  },

  // ========== 分类拖动排序 ==========
  onCategoryDragStart(e) {
    const index = e.currentTarget.dataset.index
    const touch = e.touches && e.touches[0]
    if (index === undefined || !touch) return
    this._dragState = { index, startY: touch.pageY, toIndex: index, started: false }
  },

  onCategoryDragMove(e) {
    const st = this._dragState
    if (!st) return
    const touch = e.touches && e.touches[0]
    if (!touch) return
    const dy = touch.pageY - st.startY
    if (!st.started) {
      // 位移足够才开始拖动，避免与点击/滚动误触
      if (Math.abs(dy) < 6) return
      st.started = true
      this.setData({ dragIndex: st.index })
      if (wx.vibrateShort) wx.vibrateShort({ type: 'light' })
    }
    const total = (this.data.categories || []).length
    if (total < 2) return
    const rowH = this._categoryRowH || 50
    let toIndex = st.index + Math.round(dy / rowH)
    toIndex = Math.max(0, Math.min(total - 1, toIndex))
    st.toIndex = toIndex

    const styles = []
    for (let i = 0; i < total; i++) {
      if (i === st.index) {
        styles.push(Math.round(dy))
      } else if (toIndex > st.index && i > st.index && i <= toIndex) {
        styles.push(-rowH)
      } else if (toIndex < st.index && i >= toIndex && i < st.index) {
        styles.push(rowH)
      } else {
        styles.push(0)
      }
    }
    this.setData({ categoryStyles: styles })
  },

  onCategoryDragEnd() {
    const st = this._dragState
    this._dragState = null
    const reset = () => this.setData({
      dragIndex: -1,
      categoryStyles: (this.data.categories || []).map(() => 0)
    })
    if (!st || !st.started || st.index === st.toIndex) {
      reset()
      return
    }
    const from = st.index
    const to = st.toIndex
    const prevList = this.data.categories
    const reordered = prevList.map(c => ({ ...c }))
    const [moved] = reordered.splice(from, 1)
    reordered.splice(to, 0, moved)
    reordered.forEach((c, i) => { c.sort = i })
    this.setData({
      categories: reordered,
      categoryStyles: reordered.map(() => 0),
      dragIndex: -1
    })
    this.saveCategoryOrders(prevList, reordered)
  },

  // 将调整后的分类顺序（sort）写回数据库
  async saveCategoryOrders(prevList, newList) {
    try {
      const prevIndexById = {}
      prevList.forEach((c, i) => {
        prevIndexById[c._id] = (c.sort === undefined || c.sort === null) ? i : c.sort
      })
      const sortById = {}
      newList.forEach((c, i) => { sortById[c._id] = c.sort })
      const changedIds = newList.filter(c => prevIndexById[c._id] !== c.sort).map(c => c._id)
      if (changedIds.length === 0) return
      const tasks = changedIds.map(id => wx.cloud.callFunction({
        name: 'adminSaveData',
        data: { action: 'update', collection: 'dishCategory', docId: id, data: { sort: sortById[id] } }
      }))
      await Promise.all(tasks)
      wx.showToast({ title: '排序已保存', icon: 'success' })
    } catch (err) {
      console.error('保存分类排序失败', err)
      wx.showToast({ title: '排序保存失败', icon: 'none' })
      this.loadCategories()
    }
  },

  async loadDishes(append = false) {
    if (!this.data.currentCategoryId) {
      this.setData({ dishes: [] })
      return
    }
    try {
      if (this.data.loadingDishes) return
      this.setData({ loadingDishes: true })
      wx.showLoading({ title: '加载中...' })
      // 循环加载全部菜品，每批最多100条
      let allDishes = []
      let skip = 0
      const batchSize = 20
      while (true) {
        const res = await db.collection('dish')
          .where({ categoryId: this.data.currentCategoryId })
          .orderBy('sort', 'asc')
          .skip(skip)
          .limit(batchSize)
          .get()
        const list = res.data || []
        allDishes = allDishes.concat(list)
        skip += list.length
        if (list.length < batchSize) break
      }
      this.setData({ dishes: allDishes, dishHasMore: false })
    } catch (err) {
      console.error('加载菜品失败', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ loadingDishes: false })
    }
  },

  showAddDishModal() {
    const { categories, currentCategoryId } = this.data
    if (!categories || categories.length === 0) {
      wx.showToast({ title: '请先添加分类', icon: 'none' })
      return
    }
    let category = categories.find(c => c._id === currentCategoryId)
    if (!category) category = categories[0]
    this.setData({
      showDishModal: true,
      editDishMode: false,
      currentDish: {
        _id: '',
        name: '',
        price: '',
        originalPrice: '',
        description: '',
        categoryId: category._id,
        categoryName: category.name,
        image: '',
        status: 1,
        sort: this.data.dishes.length,
        noMemberDiscount: false,
        customDiscount: '',
        tags: []
      }
    })
  },

  showEditDishModal(e) {
    const dish = e.currentTarget.dataset.dish
    this.setData({
      showDishModal: true,
      editDishMode: true,
      currentDish: {
        ...dish,
        customDiscount: (dish.customDiscount > 0 && dish.customDiscount < 100) ? dish.customDiscount : ''
      }
    })
  },

  closeDishModal() { this.setData({ showDishModal: false }) },

  // 选择菜品所属分类
  selectDishCategory(e) {
    const index = e.currentTarget.dataset.index
    const category = this.data.categories[index]
    if (!category) return
    this.setData({
      'currentDish.categoryId': category._id,
      'currentDish.categoryName': category.name
    })
  },

  async toggleDishStatus(e) {
    const dish = e.currentTarget.dataset.dish
    const newStatus = dish.status === 1 ? 0 : 1
    try {
      await wx.cloud.callFunction({
        name: 'adminSaveData',
        data: { action: 'update', collection: 'dish', docId: dish._id, data: { status: newStatus } }
      })
      wx.showToast({ title: newStatus === 1 ? '已上架' : '已下架', icon: 'success' })
      this.loadDishes()
    } catch (err) {
      console.error('切换状态失败', err)
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  onDishNameInput(e) {
    let value = e.detail.value
    if (value.length > 10) {
      value = value.substring(0, 10)
      wx.showToast({ title: '名称最多10个字', icon: 'none' })
    }
    this.setData({ 'currentDish.name': value })
  },

  onDishPriceInput(e) {
    let value = e.detail.value
    if (isNaN(value)) value = ''
    else {
      if (value < 0) { value = 0; wx.showToast({ title: '价格不能为负数', icon: 'none' }) }
      else if (value > 10000) { value = 10000; wx.showToast({ title: '价格最高10000', icon: 'none' }) }
    }
    this.setData({ 'currentDish.price': value })
  },

  onDishOriginalPriceInput(e) {
    let value = e.detail.value
    if (isNaN(value)) value = ''
    else {
      if (value < 0) { value = 0; wx.showToast({ title: '价格不能为负数', icon: 'none' }) }
      else if (value > 10000) { value = 10000; wx.showToast({ title: '价格最高10000', icon: 'none' }) }
    }
    this.setData({ 'currentDish.originalPrice': value })
  },

  onDishDescriptionInput(e) {
    let value = e.detail.value
    if (value.length > 10) {
      value = value.substring(0, 10)
      wx.showToast({ title: '描述最多10个字', icon: 'none' })
    }
    this.setData({ 'currentDish.description': value })
  },

  onDishSortInput(e) { this.setData({ 'currentDish.sort': parseInt(e.detail.value) || 0 }) },

  // 「参与会员余额支付95折」开关：关闭后本菜品余额支付不再享受店铺默认95折
  // 与全场自定义折扣相互独立：自定义折扣对所有用户/支付方式仍生效
  onMemberDiscountChange(e) {
    const participate = e.detail.value
    this.setData({
      'currentDish.noMemberDiscount': !participate
    })
  },

  // 全场自定义折扣输入：填顾客实际支付比例（1-99，如90=9折=按原价90%结算；留空/0 不设置）
  onCustomDiscountInput(e) {
    let value = e.detail.value
    if (value === '' || value === undefined || value === null) {
      this.setData({ 'currentDish.customDiscount': '' })
      return
    }
    let num = parseFloat(value)
    if (isNaN(num) || num < 0) num = 0
    if (num > 99) {
      num = 99
      wx.showToast({ title: '折扣最高99%（9.9折）', icon: 'none' })
    }
    this.setData({ 'currentDish.customDiscount': String(num) })
  },

  async chooseDishImage() {
    const res = await wx.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] })
    const tempFilePath = res.tempFilePaths[0]
    wx.showLoading({ title: '上传中...' })
    try {
      const cloudPath = `dish/${Date.now()}_${Math.random().toString(36).substr(2)}.jpg`
      const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath: tempFilePath })
      this.setData({ 'currentDish.image': uploadRes.fileID })
      wx.showToast({ title: '上传成功', icon: 'success' })
    } catch (err) {
      console.error('上传图片失败', err)
      wx.showToast({ title: '上传失败', icon: 'none' })
    } finally { wx.hideLoading() }
  },

  async saveDish() {
    const { editDishMode, currentDish } = this.data

    if (!currentDish.image || !currentDish.image.trim()) {
      wx.showToast({ title: '请上传菜品图片', icon: 'none' })
      return
    }
    if (!currentDish.name || !currentDish.name.trim()) {
      wx.showToast({ title: '请输入菜品名称', icon: 'none' })
      return
    }
    if (currentDish.name.trim().length > 10) {
      wx.showToast({ title: '菜品名称最多10个字', icon: 'none' })
      return
    }
    if (currentDish.description && currentDish.description.trim().length > 10) {
      wx.showToast({ title: '菜品描述最多10个字', icon: 'none' })
      return
    }
    if (!currentDish.categoryId) {
      wx.showToast({ title: '请选择分类', icon: 'none' })
      return
    }

    const price = parseFloat(currentDish.price)
    if (isNaN(price) || price === '' || price === null || price === undefined) {
      wx.showToast({ title: '请输入售价', icon: 'none' })
      return
    }
    if (price < 0) { wx.showToast({ title: '售价不能为负数', icon: 'none' }); return }
    if (price > 10000) { wx.showToast({ title: '售价最高10000', icon: 'none' }); return }

    const originalPrice = parseFloat(currentDish.originalPrice)
    if (isNaN(originalPrice) || originalPrice === '' || originalPrice === null || originalPrice === undefined) {
      wx.showToast({ title: '请输入原价', icon: 'none' })
      return
    }
    if (originalPrice < 0) { wx.showToast({ title: '原价不能为负数', icon: 'none' }); return }
    if (originalPrice > 10000) { wx.showToast({ title: '原价最高10000', icon: 'none' }); return }
    if (originalPrice < price) { wx.showToast({ title: '原价不能小于售价', icon: 'none' }); return }

    try {
      wx.showLoading({ title: '保存中...' })
      const { _id, _openid, ...updateData } = currentDish
      updateData.price = price
      updateData.originalPrice = originalPrice
      // 全场自定义折扣转数值入库：填支付比例（有效范围 1-99，如90=9折=按原价90%结算）；留空/0 表示不设置
      const customDiscount = parseFloat(currentDish.customDiscount)
      updateData.customDiscount = (!isNaN(customDiscount) && customDiscount > 0 && customDiscount < 100)
        ? customDiscount
        : 0
      
      if (editDishMode) {
        await wx.cloud.callFunction({
          name: 'adminSaveData',
          data: { action: 'update', collection: 'dish', docId: _id, data: updateData }
        })
      } else {
        await wx.cloud.callFunction({
          name: 'adminSaveData',
          data: { action: 'add', collection: 'dish', data: { ...updateData, createTime: new Date() } }
        })
      }
      wx.hideLoading()
      wx.showToast({ title: '保存成功', icon: 'success' })
      this.closeDishModal()
      this.loadDishes()
    } catch (err) {
      wx.hideLoading()
      console.error('保存失败', err)
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  deleteDish(e) {
    const dish = e.currentTarget.dataset.dish
    wx.showModal({
      title: '确认删除',
      content: `确定要删除菜品"${dish.name}"吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '删除中...' })
            await wx.cloud.callFunction({
              name: 'adminSaveData',
              data: { action: 'remove', collection: 'dish', docId: dish._id }
            })
            wx.hideLoading()
            wx.showToast({ title: '删除成功', icon: 'success' })
            this.loadDishes()
          } catch (err) {
            wx.hideLoading()
            console.error('删除失败', err)
            wx.showToast({ title: '删除失败', icon: 'none' })
          }
        }
      }
    })
  },

  // 标签管理
  showAddTagModal() {
    this.setData({
      showTagModal: true,
      editingTagIndex: -1,
      currentTag: { name: '', type: 'single', required: true, options: [], pickCount: 1 },
      newOption: ''
    })
  },

  showEditTagModal(e) {
    const index = e.currentTarget.dataset.index
    const tag = this.data.currentDish.tags[index]
    this.setData({
      showTagModal: true,
      editingTagIndex: index,
      currentTag: JSON.parse(JSON.stringify({ pickCount: 1, ...tag })),
      newOption: ''
    })
  },

  closeTagModal() { this.setData({ showTagModal: false }) },
  onTagNameInput(e) { this.setData({ 'currentTag.name': e.detail.value }) },
  selectTagType(e) { this.setData({ 'currentTag.type': e.currentTarget.dataset.type }) },
  onTagRequiredChange(e) { this.setData({ 'currentTag.required': e.detail.value }) },
  onOptionInput(e) { this.setData({ newOption: e.detail.value }) },
  onPickCountInput(e) {
    const raw = e.detail.value
    // 允许清空后重新输入，不再强制回退到1
    if (raw === '' || raw === undefined || raw === null) {
      this.setData({ 'currentTag.pickCount': '' })
      return
    }
    let value = parseInt(raw, 10)
    if (isNaN(value) || value < 1) value = 1
    this.setData({ 'currentTag.pickCount': value })
  },

  addOption() {
    const { currentTag, newOption } = this.data
    if (!newOption.trim()) { wx.showToast({ title: '请输入选项内容', icon: 'none' }); return }
    if (currentTag.options.includes(newOption.trim())) { wx.showToast({ title: '选项已存在', icon: 'none' }); return }
    currentTag.options.push(newOption.trim())
    this.setData({ currentTag, newOption: '' })
  },

  deleteOption(e) {
    const index = e.currentTarget.dataset.index
    const { currentTag } = this.data
    currentTag.options.splice(index, 1)
    this.setData({ currentTag })
  },

  saveTag() {
    const { currentTag, editingTagIndex, currentDish } = this.data
    if (!currentTag.name.trim()) { wx.showToast({ title: '请输入标签名称', icon: 'none' }); return }
    if (currentTag.options.length === 0) { wx.showToast({ title: '请至少添加一个选项', icon: 'none' }); return }
    if (currentTag.type === 'pick') {
      if (currentTag.options.length < 2) { wx.showToast({ title: 'N选M至少需要2个选项', icon: 'none' }); return }
      if (!currentTag.pickCount || currentTag.pickCount < 1) { wx.showToast({ title: '请设置需要选择的数量', icon: 'none' }); return }
    }

    if (editingTagIndex === -1) {
      currentDish.tags.push({ id: Date.now().toString(), ...currentTag })
    } else {
      currentDish.tags[editingTagIndex] = { id: currentDish.tags[editingTagIndex].id, ...currentTag }
    }
    this.setData({ currentDish, showTagModal: false })
  },

  deleteTag(e) {
    const index = e.currentTarget.dataset.index
    const { currentDish } = this.data
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个标签吗？',
      success: (res) => {
        if (res.confirm) {
          currentDish.tags.splice(index, 1)
          this.setData({ currentDish })
        }
      }
    })
  },

  stopPropagation() {},

  onShareAppMessage() {
    return require('../../utils/share.js').defaultShareAppMessage()
  },

  onShareTimeline() {
    return require('../../utils/share.js').defaultShareTimeline()
  }
})