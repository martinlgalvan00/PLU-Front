import { createApp } from './app.js'

const app = createApp()
const port = Number(process.env.PORT) || 3001

app.listen(port, () => {
  console.info(`API PLU ARG en http://localhost:${port}`)
})
