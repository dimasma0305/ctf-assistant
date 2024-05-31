function translate(text: string) {
    var result = text.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-]/g, "")
    while (result.includes("--")){
        result = result.replace("--", "-")
    }
    return result;
}

export { translate }
