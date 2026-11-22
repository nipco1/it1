using System;
using System.Diagnostics;
using System.IO;
using System.ServiceProcess;
using System.Threading;

public sealed class NIPCOService : ServiceBase
{
    private Process child;
    private Timer monitor;
    private readonly object gate = new object();
    private string root;
    private string node;
    private string logFile;

    public NIPCOService()
    {
        ServiceName = "NIPCOControl";
        CanStop = true;
        CanShutdown = true;
        AutoLog = true;
    }

    protected override void OnStart(string[] args)
    {
        root = Environment.GetEnvironmentVariable("NIPCO_APP_ROOT", EnvironmentVariableTarget.Machine);
        node = Environment.GetEnvironmentVariable("NIPCO_NODE_PATH", EnvironmentVariableTarget.Machine);
        if (String.IsNullOrWhiteSpace(root) || !Directory.Exists(root)) throw new InvalidOperationException("NIPCO_APP_ROOT is missing or invalid.");
        if (String.IsNullOrWhiteSpace(node) || !File.Exists(node)) throw new InvalidOperationException("NIPCO_NODE_PATH is missing or invalid.");
        logFile = Path.Combine(root, "logs", "service-host.log");
        Directory.CreateDirectory(Path.GetDirectoryName(logFile));
        StartChild();
        monitor = new Timer(_ => EnsureRunning(), null, 10000, 10000);
    }

    private void WriteLog(string message)
    {
        try { File.AppendAllText(logFile, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " " + message + Environment.NewLine); } catch { }
    }

    private void StartChild()
    {
        lock (gate)
        {
            if (child != null && !child.HasExited) return;
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = node;
                psi.Arguments = "\"server\\src\\index.js\"";
                psi.WorkingDirectory = root;
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                psi.RedirectStandardOutput = true;
                psi.RedirectStandardError = true;
                psi.EnvironmentVariables["NODE_ENV"] = "production";
                Process current = new Process();
                current.StartInfo = psi;
                current.OutputDataReceived += (s, e) => { if (e.Data != null) WriteLog("OUT " + e.Data); };
                current.ErrorDataReceived += (s, e) => { if (e.Data != null) WriteLog("ERR " + e.Data); };
                current.EnableRaisingEvents = true;
                current.Exited += (s, e) => { try { WriteLog("Node process exited with code " + current.ExitCode); } catch { } };
                current.Start();
                child = current;
                current.BeginOutputReadLine();
                current.BeginErrorReadLine();
                WriteLog("Node process started; PID=" + current.Id);
            }
            catch (Exception ex) { WriteLog("Start error: " + ex.Message); throw; }
        }
    }

    private void EnsureRunning()
    {
        try
        {
            lock (gate)
            {
                if (child == null || child.HasExited) StartChild();
            }
        }
        catch (Exception ex) { WriteLog("Restart error: " + ex.Message); }
    }

    protected override void OnStop()
    {
        if (monitor != null) { monitor.Dispose(); monitor = null; }
        lock (gate)
        {
            try
            {
                if (child != null && !child.HasExited)
                {
                    child.Kill();
                    if (!child.WaitForExit(15000)) WriteLog("Node process did not stop within 15 seconds.");
                }
            }
            catch (Exception ex) { WriteLog("Stop error: " + ex.Message); }
            finally { if (child != null) { child.Dispose(); child = null; } }
        }
        base.OnStop();
    }

    protected override void OnShutdown() { OnStop(); base.OnShutdown(); }

    public static void Main() { ServiceBase.Run(new NIPCOService()); }
}
