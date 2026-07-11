import './index.css'
import { useEffect, useState } from 'react'
import { Button } from "./components/ui/button"

function App() {
  const [collections, setCollections] = useState<any[]>([])

  useEffect(() => {
    if (!window.api) return
    window.api.collections.list().then(setCollections)
  }, [])

  const addOne = async () => {
    if (!window.api) return
    await window.api.collections.create('Test Collection')
    setCollections(await window.api.collections.list())
  }

  return (
    <div className="p-4">
      <Button onClick={addOne}>Add test collection</Button>
      <pre>{JSON.stringify(collections, null, 2)}</pre>
    </div>
  )
}

export default App