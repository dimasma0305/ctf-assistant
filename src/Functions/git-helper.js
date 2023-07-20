const fs = require("fs");
const { execSync } = require("child_process");

class GitHelper {
  constructor(repo) {
    this.repo = repo;
  }

  checkAndCloneRepo() {
    if (fs.existsSync(this.repo)) {
      console.log("The repository already exists.");
    } else {
      try {
        execSync(`git clone ${this.repo}`);
        console.log("Repository cloned successfully.");
      } catch (error) {
        console.error("Error cloning the repository:", error.message);
      }
    }
  }

  getRepoName() {
    const repoParts = this.repo.split("/");
    return repoParts[repoParts.length - 1].replace(".git", "");
  }

  pullFromRepo() {
    try {
      execSync(`cd ${this.getRepoName()} && git pull`);
      console.log("Changes pulled successfully.");
    } catch (error) {
      console.error("Error pulling changes:", error.message);
    }
  }

  pushToRepo(commitMessage) {
    try {
      execSync(
        `cd ${this.getRepoName()} && git add . && git commit -m "${commitMessage}" && git push`
      );
      console.log("Changes pushed successfully.");
    } catch (error) {
      console.error("Error pushing changes:", error.message);
    }
  }
}

module.exports = { GitHelper };
