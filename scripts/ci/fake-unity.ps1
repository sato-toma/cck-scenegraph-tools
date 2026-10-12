param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Arguments
)

$outputPath = $null
for ($index = 0; $index -lt $Arguments.Count; $index++) {
  if ($Arguments[$index] -eq "-outputPath" -and $index + 1 -lt $Arguments.Count) {
    $outputPath = $Arguments[$index + 1]
    break
  }
}

if (-not $outputPath) {
  Write-Error "Missing -outputPath"
  exit 2
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $outputPath) | Out-Null
$toml = @'
project = "CI fixture"

[[gameObjects]]
id = "ci-item"
path = "ci-item"
name = "ci-item"
parent = ""

[[gameObjects.components]]
id = "ci-scriptable-item"
type = "ClusterVR.CreatorKit.Item.Implements.ScriptableItem"
enabled = true
[gameObjects.components.properties]
Source_Code_Asset = "onGrabScript"

[[gameObjects.components]]
id = "ci-grabbable-item"
type = "ClusterVR.CreatorKit.Item.Implements.GrabbableItem"
enabled = true

[[gameObjects.components]]
id = "ci-rigidbody"
type = "UnityEngine.Rigidbody"
enabled = true

[[gameObjects]]
id = "ci-world-system"
path = "System"
name = "System"
parent = ""

[[gameObjects.components]]
id = "ci-despawn-height"
type = "ClusterVR.CreatorKit.World.Implements.DespawnHeights.DespawnHeight"
enabled = true

[[gameObjects.components]]
id = "ci-spawn-point"
type = "ClusterVR.CreatorKit.World.Implements.SpawnPoints.SpawnPoint"
enabled = true
[gameObjects.components.properties]
Spawn_Type = "Entrance"
'@
[System.IO.File]::WriteAllText(
  $outputPath,
  $toml,
  [System.Text.UTF8Encoding]::new($false)
)