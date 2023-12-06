function translate(text) { return text.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-]/g, "").toLowerCase(); }

export { translate }
