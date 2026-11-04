import { useMemo } from "react";
import { fileName, type OpenFile } from "./fileWorkspaceContext";

type FileInspectorProps = {
  file: OpenFile;
};

export function FileInspector({ file }: FileInspectorProps) {
  const dirty = file.contents !== file.savedContents;
  const byteCount = useMemo(() => new TextEncoder().encode(file.contents).length, [file.contents]);
  const modified = file.modifiedMs > 0 ? new Date(file.modifiedMs).toLocaleString() : "Unknown";

  return (
    <div className="file-inspector">
      <h3 className="file-inspector__name">{fileName(file.relativePath)}</h3>
      <p className="file-inspector__path">{file.relativePath}</p>

      <dl className="file-inspector__details">
        <div>
          <dt>Status</dt>
          <dd>
            {file.status === "loading"
              ? "Opening"
              : file.status === "error"
                ? "Unavailable"
                : file.saving
                  ? "Saving"
                  : dirty
                    ? "Modified"
                    : "Saved"}
          </dd>
        </div>
        <div>
          <dt>Size</dt>
          <dd>{byteCount.toLocaleString()} bytes</dd>
        </div>
        <div>
          <dt>Encoding</dt>
          <dd>UTF-8</dd>
        </div>
        <div>
          <dt>Last modified</dt>
          <dd>{modified}</dd>
        </div>
        {file.backupPath ? (
          <div>
            <dt>Last backup</dt>
            <dd>{file.backupPath}</dd>
          </div>
        ) : null}
      </dl>

      <p className="file-inspector__note">
        Project files are saved explicitly. Each save keeps the previous contents beside the file as
        a numbered backup.
      </p>
    </div>
  );
}
