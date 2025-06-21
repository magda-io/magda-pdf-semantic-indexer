{{- define "semanticIndexer.values" }}
  {{- $semanticIndexer := get .Values "semanticIndexer" | default dict }}
  {{- $globalSemanticIndexer := get .Values.global.searchEngine "semanticIndexer" | default dict }}
  
  {{- $indexVersion := get $semanticIndexer "indexVersion" | default (get $globalSemanticIndexer "indexVersion") }}
  {{- $indexName := get $semanticIndexer "indexName" | default (get $globalSemanticIndexer "indexName") }}
  
  {{- $_ := set $semanticIndexer "numberOfShards" (get $globalSemanticIndexer "numberOfShards") }}
  {{- $_ := set $semanticIndexer "numberOfReplicas" (get $globalSemanticIndexer "numberOfReplicas") }}
  {{- $_ := set $semanticIndexer "knnVectorFieldConfig" (get $globalSemanticIndexer "knnVectorFieldConfig") }}
  {{- $_ := set $semanticIndexer "indexName" $indexName }}
  {{- $_ := set $semanticIndexer "indexVersion" $indexVersion }}

  {{- $semanticIndexer | toJson }}
{{- end }}