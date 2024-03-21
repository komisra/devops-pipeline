# devops-pipeline


## Getting Started

```bash
npm install
npm link
```

## Usage

You can run the CLI app in any directory. In this milestone, we want to use the CLI app with a build.yml file for Ghost project.

```bash
pipelines --help
pipelines init --build <build.yml>
pipelines build --build <build.yml> --job <job>
```

Here's an example of these commands being used.

```bash
npm install
node index init -b build.yml
node index build -b build.yml -j build
```

---

You can add environment variables that you need in a `.env` file in the root directory of the project. Then access the variables in your code using `process.env.FOO`. For example, if you have a `.env` file with the following content:

```bash
FOO=bar
```