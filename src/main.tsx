import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ThemeProvider } from './store/theme'
import { ProjectsProvider } from './store/projects'
import { UpdateToast } from './components/UpdateToast'
import { installBrowserStub } from './browserStub'
import './index.css'

installBrowserStub()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <ProjectsProvider>
        <App />
        <UpdateToast />
      </ProjectsProvider>
    </ThemeProvider>
  </React.StrictMode>
)
