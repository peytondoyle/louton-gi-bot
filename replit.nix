{ pkgs }:
{
  deps = [
    pkgs.nodejs-20_x          # Node 20 with npm bundled
    pkgs.bashInteractive      # bash
    pkgs.git                  # git (auto-deploy script uses it)
    pkgs.cacert               # TLS certs for HTTPS requests
  ];
}
