{ pkgs }:
{
  deps = [
    pkgs.nodejs-20_x
    pkgs.nodePackages.npm
    pkgs.bash
    pkgs.cacert
  ];
}
