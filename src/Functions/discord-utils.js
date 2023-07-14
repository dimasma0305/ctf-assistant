module.exports = {
    /**
     * translate to discord channel format
     */
    translate: (text) => text.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-]/g, "").toLowerCase()
}
