using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

using PersistentId = System.String;

namespace UnitySemanticGraph.Editor.Exporter
{
    public static class SelectiveComponentTomlExporter
    {
        private const string ItemMaterialSetListTypeName = "ClusterVR.CreatorKit.Item.Implements.ItemMaterialSetList";
        private const string ItemMaterialSetsPropertyName = "itemMaterialSets";
        private const string ItemMaterialSetsDisplayName = "Item Material Sets";
        private const string RendererMaterialGuidsPropertyName = "Renderer_Material_Guids";

        public static void ExportGraphToToml()
        {
            try
            {
                var args = Environment.GetCommandLineArgs();
                var scenePath = GetCommandLineArgument(args, "-scenePath");
                var outputPath = GetCommandLineArgument(args, "-outputPath");

                if (!string.IsNullOrEmpty(scenePath))
                {
                    var projectRoot = Directory.GetParent(Application.dataPath).FullName;
                    var resolvedScenePath = Path.IsPathRooted(scenePath)
                        ? scenePath
                        : Path.Combine(projectRoot, scenePath);
                    var scene = EditorSceneManager.OpenScene(resolvedScenePath, OpenSceneMode.Single);
                    if (!scene.IsValid() || !scene.isLoaded)
                    {
                        throw new InvalidOperationException($"Failed to open scene: {resolvedScenePath}");
                    }
                }

                var activeScene = SceneManager.GetActiveScene();
                if (!activeScene.IsValid() || string.IsNullOrEmpty(activeScene.path))
                {
                    throw new InvalidOperationException("No valid scene is open. Pass -scenePath Assets/Scenes/Example.unity.");
                }

                var resolvedOutputPath = ResolveOutputPath(outputPath);
                var processed = CollectSceneGameObjects(activeScene);
                Directory.CreateDirectory(Path.GetDirectoryName(resolvedOutputPath));
                WriteSceneToml(resolvedOutputPath, processed.Values);
                Debug.Log($"SceneGraph TOML exported: {resolvedOutputPath}");

                if (Application.isBatchMode)
                {
                    EditorApplication.Exit(0);
                }
            }
            catch (Exception ex)
            {
                Debug.LogError($"SceneGraph TOML export failed: {ex}");
                if (Application.isBatchMode)
                {
                    EditorApplication.Exit(1);
                }
            }
        }

        [MenuItem("SemanticGraph/Export All Component Graph to TOML")]
        private static void ExportAllGraph()
        {
            var scene = SceneManager.GetActiveScene();
            var processed = CollectSceneGameObjects(scene);
            var savePath = EditorUtility.SaveFilePanel("Export TOML", Application.dataPath, "SceneGraph.toml", "toml");
            if (string.IsNullOrEmpty(savePath)) return;

            try
            {
                WriteSceneToml(savePath, processed.Values);
                AssetDatabase.Refresh();
                EditorUtility.DisplayDialog("Export Completed", $"TOML ファイルを出力しました:\n{savePath}", "OK");
            }
            catch (Exception ex)
            {
                Debug.LogError(ex);
                EditorUtility.DisplayDialog("Export Failed", ex.Message, "OK");
            }
        }

        [MenuItem("SemanticGraph/Update Selected Component Graph to TOML")]
        private static void ExportSelectedGraph()
        {
            var selectedGameObjects = Selection.gameObjects;
            var selectedComponents = Selection.objects.OfType<Component>().ToArray();
            var gameObjects = new HashSet<GameObject>(selectedGameObjects);

            foreach (var component in selectedComponents)
            {
                if (component == null) continue;
                gameObjects.Add(component.gameObject);
            }

            if (gameObjects.Count == 0)
            {
                EditorUtility.DisplayDialog("Export Selected Component Graph", "Hierarchy またはインスペクタで GameObject / Component を選択してください。", "OK");
                return;
            }

            var savePath = EditorUtility.SaveFilePanel("Update/Export TOML", Application.dataPath, "SceneGraph.toml", "toml");
            if (string.IsNullOrEmpty(savePath)) return;

            var processed = new Dictionary<PersistentId, GameObjectInfo>(); // Key: ID

            // 既存のファイルがある場合は読み込んで辞書を初期化する (差分更新のベース)
            if (File.Exists(savePath))
            {
                try
                {
                    var existingData = ParseToml(savePath);
                    foreach (var info in existingData)
                    {
                        if (!string.IsNullOrEmpty(info.Id)) processed[info.Id] = info;
                    }
                }
                catch (Exception ex)
                {
                    Debug.LogWarning($"既存ファイルの読み込みに失敗しました。新規として書き出します: {ex.Message}");
                }
            }

            foreach (var gameObject in gameObjects)
            {
                AddWithParents(gameObject, processed);
                AddRelevantDescendants(gameObject, processed);
            }

            try
            {
                WriteSceneToml(savePath, processed.Values);
                AssetDatabase.Refresh();
                EditorUtility.DisplayDialog("Export Completed", $"TOML ファイルを出力しました:\n{savePath}", "OK");
            }
            catch (Exception ex)
            {
                Debug.LogError(ex);
                EditorUtility.DisplayDialog("Export Failed", ex.Message, "OK");
            }
        }

        private static void AddWithParents(GameObject gameObject, Dictionary<PersistentId, GameObjectInfo> processed)
        {
            if (gameObject == null) return;
            var id = GetPersistentId(gameObject);

            // ID をキーにして情報を生成/上書きする
            // これにより、移動（Path変更）したオブジェクトも同一IDとして正しく更新される

            var info = new GameObjectInfo
            {
                Id = id,
                Name = gameObject.name,
                Path = GetGameObjectPath(gameObject),
                ParentPath = gameObject.transform.parent != null ? GetGameObjectPath(gameObject.transform.parent.gameObject) : string.Empty,
                Components = GatherComponents(gameObject)
            };
            processed[id] = info;

            if (gameObject.transform.parent != null)
            {
                AddWithParents(gameObject.transform.parent.gameObject, processed);
            }
        }

        private static void AddRelevantDescendants(GameObject gameObject, Dictionary<PersistentId, GameObjectInfo> processed)
        {
            if (gameObject == null) return;
            foreach (Transform child in gameObject.transform)
            {
                if (child == null) continue;
                var childGo = child.gameObject;
                if (HasRelevantComponents(childGo) || HasRelevantChildren(childGo))
                {
                    AddWithParents(childGo, processed);
                    AddRelevantDescendants(childGo, processed);
                }
            }
        }

        private static bool HasRelevantComponents(GameObject go)
        {
            return go.GetComponents<Component>().Any(c => c != null && !(c is Transform));
        }

        private static bool HasRelevantChildren(GameObject go)
        {
            foreach (Transform child in go.transform)
            {
                if (child == null) continue;
                if (HasRelevantComponents(child.gameObject) || HasRelevantChildren(child.gameObject))
                {
                    return true;
                }
            }

            return false;
        }

        private static Dictionary<PersistentId, GameObjectInfo> CollectSceneGameObjects(Scene scene)
        {
            var processed = new Dictionary<PersistentId, GameObjectInfo>();
            foreach (var root in scene.GetRootGameObjects())
            {
                AddWithParents(root, processed);
                AddRelevantDescendants(root, processed);
            }

            return processed;
        }

        private static string GetCommandLineArgument(string[] args, string name)
        {
            for (var index = 0; index < args.Length - 1; index++)
            {
                if (args[index] == name)
                {
                    return args[index + 1];
                }
            }

            return null;
        }

        private static string ResolveOutputPath(string outputPath)
        {
            var projectRoot = Directory.GetParent(Application.dataPath).FullName;
            var path = string.IsNullOrEmpty(outputPath) ? "SceneGraph.toml" : outputPath;
            return Path.GetFullPath(Path.IsPathRooted(path) ? path : Path.Combine(projectRoot, path));
        }

        private static void WriteSceneToml(string filePath, IEnumerable<GameObjectInfo> gameObjects)
        {
            var sorted = gameObjects.OrderBy(g => g.Path).ToList();
            WriteToml(filePath, sorted, GatherReferencedMaterials(sorted));
        }

        /// <summary>
        /// ItemMaterialSetList から参照されている Material を収集します。
        /// </summary>
        private static List<MaterialInfo> GatherReferencedMaterials(IEnumerable<GameObjectInfo> gameObjects)
        {
            var guids = new SortedSet<string>(StringComparer.Ordinal);
            foreach (var gameObject in gameObjects)
            {
                foreach (var component in gameObject.Components)
                {
                    if (component.Type != ItemMaterialSetListTypeName) continue;
                    if (!component.Properties.TryGetValue(ItemMaterialSetsDisplayName, out var value)) continue;
                    if (!(value is IEnumerable<object> entries)) continue;

                    foreach (var entry in entries)
                    {
                        if (!(entry is string text)) continue;
                        var separator = text.LastIndexOf('=');
                        if (separator <= 0 || separator == text.Length - 1) continue;
                        guids.Add(text.Substring(separator + 1));
                    }
                }
            }

            var materials = new List<MaterialInfo>();
            foreach (var guid in guids)
            {
                var assetPath = AssetDatabase.GUIDToAssetPath(guid);
                if (string.IsNullOrEmpty(assetPath)) continue;
                var material = AssetDatabase.LoadAssetAtPath<Material>(assetPath);
                if (material == null) continue;

                materials.Add(new MaterialInfo
                {
                    Guid = guid,
                    Name = material.name,
                    Path = assetPath,
                    Shader = material.shader != null ? material.shader.name : string.Empty,
                    EmissionEnabled = material.IsKeywordEnabled("_EMISSION"),
                    EmissionColor = material.HasProperty("_EmissionColor") ? material.GetColor("_EmissionColor") : (Color?)null,
                });
            }

            return materials;
        }


        private static IReadOnlyList<ComponentInfo> GatherComponents(GameObject go)
        {
            var components = new List<ComponentInfo>();
            foreach (var component in go.GetComponents<Component>())
            {
                if (component == null) continue;
                if (component is Transform) continue;

                var info = new ComponentInfo
                {
                    Id = GetPersistentId(component),
                    Type = component.GetType().FullName,
                    Enabled = GetEnabledState(component),
                    Properties = GatherSerializableProperties(component)
                };

                components.Add(info);
            }

            return components;
        }

        private static bool GetEnabledState(Component component)
        {
            if (component is Behaviour behaviour)
            {
                return behaviour.enabled;
            }

            if (component is Collider collider)
            {
                return collider.enabled;
            }

            return true;
        }

        private static Dictionary<string, object> GatherSerializableProperties(Component component)
        {
            var values = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            if (component is Renderer renderer)
            {
                values[RendererMaterialGuidsPropertyName] = GetRendererMaterialGuids(renderer);
            }
            if (component is Collider collider)
            {
                values["Is_Trigger"] = collider.isTrigger;
            }

            var serializedObject = new SerializedObject(component);
            var property = serializedObject.GetIterator();

            if (!property.NextVisible(true))
            {
                return values;
            }

            do
            {
                if (property.depth != 0) continue;
                if (property.name == "m_Script" || property.name == "m_GameObject" || property.name == "m_Enabled") continue;
                if (property.name.StartsWith("m_")) continue;

                var key = property.displayName;
                var value = component.GetType().FullName == ItemMaterialSetListTypeName && property.name == ItemMaterialSetsPropertyName
                    ? GetItemMaterialSetEntries(property)
                    : GetSerializedPropertyValue(property);
                if (value != null)
                {
                    values[key] = value;
                }
            }
            while (property.NextVisible(false));

            return values;
        }

        private static object GetRendererMaterialGuids(Renderer renderer)
        {
            var guids = new List<object>();
            foreach (var material in renderer.sharedMaterials)
            {
                if (material == null) continue;
                if (!AssetDatabase.TryGetGUIDAndLocalFileIdentifier(material, out var guid, out long _)) continue;
                guids.Add(guid);
            }

            return guids;
        }

        private static object GetSerializedPropertyValue(SerializedProperty property)
        {
            switch (property.propertyType)
            {
                case SerializedPropertyType.Integer:
                    return property.intValue;
                case SerializedPropertyType.Boolean:
                    return property.boolValue;
                case SerializedPropertyType.Float:
                    return property.floatValue;
                case SerializedPropertyType.String:
                    return property.stringValue;
                case SerializedPropertyType.Color:
                    return property.colorValue;
                case SerializedPropertyType.ObjectReference:
                    return property.objectReferenceValue != null ? property.objectReferenceValue.name : null;
                case SerializedPropertyType.Enum:
                    return property.enumNames[property.enumValueIndex];
                case SerializedPropertyType.Vector2:
                    return property.vector2Value;
                case SerializedPropertyType.Vector3:
                    return property.vector3Value;
                case SerializedPropertyType.Vector4:
                    return property.vector4Value;
                case SerializedPropertyType.Rect:
                    return property.rectValue;
                case SerializedPropertyType.Vector2Int:
                    return property.vector2IntValue;
                case SerializedPropertyType.Vector3Int:
                    return property.vector3IntValue;
                case SerializedPropertyType.Bounds:
                    return property.boundsValue;
                case SerializedPropertyType.Quaternion:
                    return property.quaternionValue;
                case SerializedPropertyType.ArraySize:
                case SerializedPropertyType.Generic:
                    if (property.isArray && property.propertyType != SerializedPropertyType.String)
                    {
                        return GetArrayValues(property);
                    }
                    return null;
                default:
                    return null;
            }
        }

        private static object GetArrayValues(SerializedProperty arrayProperty)
        {
            var elements = new List<object>();
            var propertyCopy = arrayProperty.Copy();
            var depth = propertyCopy.depth;
            var enterChildren = true;

            if (!propertyCopy.NextVisible(enterChildren))
            {
                return null;
            }

            while (propertyCopy.depth > depth)
            {
                if (propertyCopy.name == "Array" || propertyCopy.name == "data")
                {
                    if (propertyCopy.propertyType != SerializedPropertyType.Generic && propertyCopy.propertyType != SerializedPropertyType.ObjectReference)
                    {
                        var value = GetSerializedPropertyValue(propertyCopy);
                        if (value != null)
                        {
                            elements.Add(value);
                        }
                    }
                }

                if (!propertyCopy.NextVisible(false))
                {
                    break;
                }
            }

            return elements.Count > 0 ? (object)elements : null;
        }

        private static object GetItemMaterialSetEntries(SerializedProperty arrayProperty)
        {
            var entries = new List<object>();
            for (var index = 0; index < arrayProperty.arraySize; index++)
            {
                var element = arrayProperty.GetArrayElementAtIndex(index);
                var id = element.FindPropertyRelative("id")?.stringValue;
                var material = element.FindPropertyRelative("material")?.objectReferenceValue;
                if (string.IsNullOrEmpty(id) || material == null) continue;
                if (!AssetDatabase.TryGetGUIDAndLocalFileIdentifier(material, out var guid, out long _)) continue;

                // 形式: "<id>=<material guid>"。GUID に '=' は含まれないため、区切りは最後の '=' を使う。
                entries.Add($"{id}={guid}");
            }

            return entries.Count > 0 ? (object)entries : null;
        }

        /// <summary>
        /// データをストリーム経由で直接ファイルに書き込みます。
        /// 巨大な文字列をメモリに生成するのを避けます。
        /// </summary>
        private static void WriteToml(string filePath, IReadOnlyList<GameObjectInfo> gameObjects, IReadOnlyList<MaterialInfo> materials)
        {
            using var writer = new StreamWriter(filePath);

            writer.WriteLine("project = \"UnitySemanticGraph\"");
            writer.WriteLine();

            for (var index = 0; index < gameObjects.Count; index++)
            {
                var go = gameObjects[index];
                writer.WriteLine("[[gameObjects]]");
                writer.WriteLine($"id = \"{EscapeTomlString(go.Id)}\"");
                writer.WriteLine($"path = \"{EscapeTomlString(go.Path)}\"");
                writer.WriteLine($"name = \"{EscapeTomlString(go.Name)}\"");
                writer.WriteLine($"parent = \"{EscapeTomlString(go.ParentPath)}\"");

                if (go.Components.Count > 0)
                {
                    for (var componentIndex = 0; componentIndex < go.Components.Count; componentIndex++)
                    {
                        var component = go.Components[componentIndex];
                        writer.WriteLine("[[gameObjects.components]]");
                        writer.WriteLine($"id = \"{EscapeTomlString(component.Id)}\"");
                        writer.WriteLine($"type = \"{EscapeTomlString(component.Type)}\"");
                        writer.WriteLine($"enabled = {component.Enabled.ToString().ToLowerInvariant()}");

                        if (component.Properties.Count > 0)
                        {
                            writer.WriteLine("[gameObjects.components.properties]");
                            foreach (var property in component.Properties)
                            {
                                writer.WriteLine($"{EscapeTomlKey(property.Key)} = {FormatTomlValue(property.Value)}");
                            }
                            writer.WriteLine();
                        }
                    }
                }

                writer.WriteLine();
            }

            foreach (var material in materials)
            {
                writer.WriteLine("[[materials]]");
                writer.WriteLine($"guid = \"{EscapeTomlString(material.Guid)}\"");
                writer.WriteLine($"name = \"{EscapeTomlString(material.Name)}\"");
                writer.WriteLine($"path = \"{EscapeTomlString(material.Path)}\"");
                writer.WriteLine($"shader = \"{EscapeTomlString(material.Shader)}\"");
                writer.WriteLine($"emissionEnabled = {material.EmissionEnabled.ToString().ToLowerInvariant()}");
                if (material.EmissionColor.HasValue)
                {
                    var color = material.EmissionColor.Value;
                    writer.WriteLine($"emissionColor = {FormatTomlValue(new Vector4(color.r, color.g, color.b, color.a))}");
                }
                writer.WriteLine();
            }
        }

        private sealed class MaterialInfo
        {
            public string Guid { get; set; }
            public string Name { get; set; }
            public string Path { get; set; }
            public string Shader { get; set; }
            public bool EmissionEnabled { get; set; }
            public Color? EmissionColor { get; set; }
        }

        private static string FormatTomlValue(object value)
        {
            switch (value)
            {
                case string s:
                    return $"\"{EscapeTomlString(s)}\"";
                case bool b:
                    return b ? "true" : "false";
                case int i:
                    return i.ToString();
                case long l:
                    return l.ToString();
                case float f:
                    return FormatTomlFloat(f.ToString("G", System.Globalization.CultureInfo.InvariantCulture));
                case double d:
                    return FormatTomlFloat(d.ToString("G", System.Globalization.CultureInfo.InvariantCulture));
                case Vector2 v2:
                    return $"[{FormatTomlFloat(v2.x.ToString("G", System.Globalization.CultureInfo.InvariantCulture))}, {FormatTomlFloat(v2.y.ToString("G", System.Globalization.CultureInfo.InvariantCulture))}]";
                case Vector3 v3:
                    return $"[{FormatTomlFloat(v3.x.ToString("G", System.Globalization.CultureInfo.InvariantCulture))}, {FormatTomlFloat(v3.y.ToString("G", System.Globalization.CultureInfo.InvariantCulture))}, {FormatTomlFloat(v3.z.ToString("G", System.Globalization.CultureInfo.InvariantCulture))}]";
                case Vector4 v4:
                    return $"[{FormatTomlFloat(v4.x.ToString("G", System.Globalization.CultureInfo.InvariantCulture))}, {FormatTomlFloat(v4.y.ToString("G", System.Globalization.CultureInfo.InvariantCulture))}, {FormatTomlFloat(v4.z.ToString("G", System.Globalization.CultureInfo.InvariantCulture))}, {FormatTomlFloat(v4.w.ToString("G", System.Globalization.CultureInfo.InvariantCulture))}]";
                case Vector2Int v2i:
                    return $"[{v2i.x}, {v2i.y}]";
                case Vector3Int v3i:
                    return $"[{v3i.x}, {v3i.y}, {v3i.z}]";
                case Rect rect:
                    return $"[{FormatTomlFloat(rect.x.ToString("G", System.Globalization.CultureInfo.InvariantCulture))}, {FormatTomlFloat(rect.y.ToString("G", System.Globalization.CultureInfo.InvariantCulture))}, {FormatTomlFloat(rect.width.ToString("G", System.Globalization.CultureInfo.InvariantCulture))}, {FormatTomlFloat(rect.height.ToString("G", System.Globalization.CultureInfo.InvariantCulture))}]";
                case Bounds bounds:
                    return $"[[{FormatTomlFloat(bounds.center.x.ToString("G", System.Globalization.CultureInfo.InvariantCulture))}, {FormatTomlFloat(bounds.center.y.ToString("G", System.Globalization.CultureInfo.InvariantCulture))}, {FormatTomlFloat(bounds.center.z.ToString("G", System.Globalization.CultureInfo.InvariantCulture))}], [{FormatTomlFloat(bounds.extents.x.ToString("G", System.Globalization.CultureInfo.InvariantCulture))}, {FormatTomlFloat(bounds.extents.y.ToString("G", System.Globalization.CultureInfo.InvariantCulture))}, {FormatTomlFloat(bounds.extents.z.ToString("G", System.Globalization.CultureInfo.InvariantCulture))}]]";
                case Quaternion quaternion:
                    return $"[{FormatTomlFloat(quaternion.x.ToString("G", System.Globalization.CultureInfo.InvariantCulture))}, {FormatTomlFloat(quaternion.y.ToString("G", System.Globalization.CultureInfo.InvariantCulture))}, {FormatTomlFloat(quaternion.z.ToString("G", System.Globalization.CultureInfo.InvariantCulture))}, {FormatTomlFloat(quaternion.w.ToString("G", System.Globalization.CultureInfo.InvariantCulture))}]";
                case IList<object> list:
                    return $"[{string.Join(", ", list.Select(FormatTomlValue))}]";
                case IEnumerable<object> enumerable:
                    return $"[{string.Join(", ", enumerable.Select(FormatTomlValue))}]";
                default:
                    return $"\"{EscapeTomlString(value.ToString())}\"";
            }
        }

        private static string FormatTomlFloat(string value)
        {
            return value.IndexOf('.') >= 0 || value.IndexOf('E') >= 0 || value.IndexOf('e') >= 0
                ? value
                : value + ".0";
        }

        private static string EscapeTomlString(string value)
        {
            return value.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", "\\n").Replace("\r", "\\r");
        }

        private static string EscapeTomlKey(string key)
        {
            return key.Replace(" ", "_").Replace("-", "_");
        }

        /// <summary>
        /// 簡易的な TOML パーサー。
        /// 既存のファイルを読み込み、GameObjectInfo のリストを復元します。
        /// </summary>
        private static List<GameObjectInfo> ParseToml(string filePath)
        {
            var results = new List<GameObjectInfo>();
            GameObjectInfo currentGo = null;

            // File.ReadLines は一度に全行をメモリに載せず、一行ずつ処理します
            foreach (var line in File.ReadLines(filePath))
            {
                var trimmed = line.Trim();
                if (trimmed == "[[gameObjects]]")
                {
                    currentGo = new GameObjectInfo { Components = new List<ComponentInfo>() };
                    results.Add(currentGo);
                }
                else if (currentGo != null && trimmed.StartsWith("path = \""))
                {
                    currentGo.Path = trimmed.Split('"')[1].Replace("\\\\", "\\").Replace("\\\"", "\"");
                }
                else if (currentGo != null && trimmed.StartsWith("name = \""))
                {
                    currentGo.Name = trimmed.Split('"')[1].Replace("\\\\", "\\").Replace("\\\"", "\"");
                }
                else if (currentGo != null && trimmed.StartsWith("parent = \""))
                {
                    currentGo.ParentPath = trimmed.Split('"')[1].Replace("\\\\", "\\").Replace("\\\"", "\"");
                }
                else if (currentGo != null && trimmed.StartsWith("id = \""))
                {
                    currentGo.Id = trimmed.Split('"')[1];
                }
                // コンポーネントやプロパティの完全な復元にはより高度な解析が必要ですが、
                // 差分更新の「既存ノードの維持」目的であればパスの特定が最優先となります。
            }
            return results;
        }

        /// <summary>
        /// Unity の GlobalObjectId を使用して、エディタセッションを跨いで不変な ID を取得します。
        /// </summary>
        private static PersistentId GetPersistentId(UnityEngine.Object obj)
        {
            if (obj == null) return string.Empty;
            return GlobalObjectId.GetGlobalObjectIdSlow(obj).ToString();
        }

        private static string GetGameObjectPath(GameObject gameObject)
        {
            var path = gameObject.name;
            var parent = gameObject.transform.parent;
            while (parent != null)
            {
                path = parent.name + "/" + path;
                parent = parent.parent;
            }

            return path;
        }

        private sealed class GameObjectInfo : IGameObjectInfo
        {
            public PersistentId Id { get; set; }
            public string Name { get; set; }
            public string Path { get; set; }
            public string ParentPath { get; set; }
            public IReadOnlyList<ComponentInfo> Components { get; set; } = Array.Empty<ComponentInfo>();
        }

        private sealed class ComponentInfo
        {
            public PersistentId Id { get; set; }
            public string Type { get; set; }
            public bool Enabled { get; set; }
            public IReadOnlyDictionary<string, object> Properties { get; set; }
        }

        private interface IGameObjectInfo
        {
            IReadOnlyList<ComponentInfo> Components { get; }
        }
    }
}
