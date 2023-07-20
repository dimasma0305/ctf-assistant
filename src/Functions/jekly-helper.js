const fs = require("fs");
const path = require("path");

class JekyllHelper {
    constructor(jekyllWorkingDir) {
        this.jekyllWorkingDir = jekyllWorkingDir;
    }

    formatDate(date) {
        // Format the date as YYYY-MM-DD
        return date.toISOString().slice(0, 10);
    }

    sanitizeTitle(title) {
        // Remove any characters that are not alphanumeric, spaces, or hyphens
        return title.replace(/[^\w\s-]/g, "");
    }

    createPost(title, content) {
        const currentDate = new Date();
        const formattedDate = this.formatDate(currentDate);

        // Sanitize the title to create the filename
        const sanitizedTitle = this.sanitizeTitle(title);
        const filename = `${formattedDate}-${sanitizedTitle.replace(/\s/g, "-").toLowerCase()}.md`;

        // Construct the full path to the new post file
        const filePath = path.join(this.jekyllWorkingDir, "_posts", filename);

        try {
            fs.writeFileSync(filePath, content);
            console.log(`Post '${title}' created successfully: ${filePath}`);
        } catch (error) {
            console.error("Error creating post:", error.message);
        }
    }
}

module.exports = { JekyllHelper }
